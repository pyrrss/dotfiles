/**
 * Pi MCP Client Extension
 *
 * Conecta pi a uno o varios servidores MCP (Model Context Protocol)
 * y registra sus herramientas como tools nativas de pi.
 *
 * Transports soportados:
 *   - stdio  (proceso local, ej: python/npx/docker)
 *   - http   (Streamable HTTP)
 *   - sse    (SSE legacy)
 *
 * Configuración: ~/.pi/mcp-servers.json  (o ~/.config/pi/mcp-servers.json)
 *
 * ```json
 * {
 *   "servers": {
 *     "clima": {
 *       "type": "stdio",
 *       "command": "docker run --rm -i mcp-project:latest"
 *     },
 *     "otro": {
 *       "type": "http",
 *       "url": "http://localhost:8000/mcp"
 *     }
 *   }
 * }
 * ```
 *
 * Comando: /mcp  -> lista el estado de los servidores conectados.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

// --------------------------------------------------------------------------
// Configuración
// --------------------------------------------------------------------------

interface McpServerConfig {
  type: "stdio" | "http" | "sse";
  /** stdio: comando completo (puede llevar argumentos) o comando + args[] */
  command?: string;
  /** stdio: argumentos extra */
  args?: string[];
  /** stdio: directorio de trabajo */
  cwd?: string;
  /** stdio: variables de entorno adicionales */
  env?: Record<string, string>;
  /** http/sse: URL del endpoint MCP */
  url?: string;
  /** http: timeout de conexión en ms */
  timeout?: number;
  enabled?: boolean;
}

interface McpConfig {
  servers?: Record<string, McpServerConfig>;
}

function loadConfig(cwd: string): McpConfig {
  const candidates = [
    join(cwd, "mcp-servers.json"),
    join(cwd, ".pi", "mcp-servers.json"),
    join(homedir(), ".config", "pi", "mcp-servers.json"),
    join(homedir(), ".pi", "mcp-servers.json"),
  ];
  for (const path of candidates) {
    try {
      if (existsSync(path)) {
        return JSON.parse(readFileSync(path, "utf-8")) as McpConfig;
      }
    } catch (e) {
      console.error(`[mcp-client] Error leyendo config ${path}:`, e);
    }
  }
  return {};
}

// --------------------------------------------------------------------------
// Utilidades
// --------------------------------------------------------------------------

function normalizeToolName(input: string): string {
  return (input.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "")) || "unnamed";
}

function sanitizeServerId(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "server";
}

/** Convierte un JSON Schema (inputSchema de MCP) a un esquema TypeBox para pi. */
function jsonSchemaToTypeBox(schema: any): any {
  if (!schema || typeof schema !== "object") return Type.Any();

  const type = schema.type;

  // Fallback para schemas sin tipo o con tipos compuestos
  if (Array.isArray(type)) return Type.Any();
  if (schema.anyOf || schema.oneOf) return Type.Any();

  switch (type) {
    case "string": {
      if (Array.isArray(schema.enum) && schema.enum.length > 0) {
        const literals = schema.enum.map((v: unknown) => Type.Literal(String(v)));
        return literals.length === 1 ? literals[0] : Type.Union(literals);
      }
      const opts: Record<string, unknown> = {};
      if (typeof schema.minLength === "number") opts.minLength = schema.minLength;
      if (typeof schema.maxLength === "number") opts.maxLength = schema.maxLength;
      return Type.String(opts);
    }
    case "number": {
      const opts: Record<string, unknown> = {};
      if (typeof schema.minimum === "number") opts.minimum = schema.minimum;
      if (typeof schema.maximum === "number") opts.maximum = schema.maximum;
      return Type.Number(opts);
    }
    case "integer": {
      const opts: Record<string, unknown> = {};
      if (typeof schema.minimum === "number") opts.minimum = schema.minimum;
      if (typeof schema.maximum === "number") opts.maximum = schema.maximum;
      return Type.Integer(opts);
    }
    case "boolean":
      return Type.Boolean();
    case "array":
      return Type.Array(schema.items ? jsonSchemaToTypeBox(schema.items) : Type.Any());
    case "object":
    case undefined: {
      const properties: Record<string, any> = {};
      const required: string[] = Array.isArray(schema.required) ? schema.required : [];
      for (const [key, propSchema] of Object.entries((schema.properties as Record<string, any>) ?? {})) {
        const converted = jsonSchemaToTypeBox(propSchema);
        properties[key] = required.includes(key) ? converted : Type.Optional(converted);
      }
      return Type.Object(properties);
    }
    default:
      return Type.Any();
  }
}

function extractText(result: any, serverId: string, toolName: string): string {
  const content: any[] = Array.isArray(result?.content) ? result.content : [];
  const parts: string[] = [];
  for (const item of content) {
    if (item?.type === "text" && typeof item.text === "string") {
      parts.push(item.text);
    } else if (item?.type === "image") {
      parts.push(`[imagen: ${item.mimeType ?? "desconocido"}, ${item.data?.length ?? 0} bytes]`);
    } else if (item?.type === "resource") {
      parts.push(`[recurso: ${item.resource?.uri ?? item.uri ?? "desconocido"}]`);
    } else {
      parts.push(JSON.stringify(item));
    }
  }
  const text = parts.join("\n").trim();
  if (result?.isError) {
    throw new Error(text || `Error del servidor MCP "${serverId}" llamando a "${toolName}"`);
  }
  return text || `(sin respuesta de "${toolName}")`;
}

// --------------------------------------------------------------------------
// Extensión
// --------------------------------------------------------------------------

export default function mcpClientExtension(pi: ExtensionAPI) {
  const clients = new Map<string, { client: Client; transport: any }>();
  const registeredTools = new Set<string>();

  async function connectServer(id: string, cfg: McpServerConfig): Promise<string | null> {
    try {
      const client = new Client({ name: "pi-mcp-client", version: "0.1.0" });
      let transport: any;

      if (cfg.type === "stdio") {
        const commandStr = (cfg.command ?? "").trim();
        const [cmd, ...cmdArgs] = commandStr.split(/\s+/).filter(Boolean);
        if (!cmd) throw new Error(`falta "command"`);

        let env: Record<string, string> = {};
        try {
          env = { ...getDefaultEnvironment() };
        } catch {
          // sin PATH disponible: se usan solo las env explícitas
        }
        env = { ...env, ...(cfg.env ?? {}) };

        transport = new StdioClientTransport({
          command: cmd,
          args: [...cmdArgs, ...(cfg.args ?? [])],
          cwd: cfg.cwd ? resolve(cfg.cwd) : undefined,
          env,
          stderr: "pipe" as const,
        });

        // Consumir stderr para diagnóstico sin bloquear
        (transport as any).stderr?.on?.("data", (chunk: Buffer) => {
          const line = chunk.toString().trim();
          if (line) console.error(`[mcp-client][${id}] stderr: ${line}`);
        });
      } else if (cfg.type === "http") {
        if (!cfg.url) throw new Error(`falta "url"`);
        transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
          requestInit: cfg.timeout ? { signal: AbortSignal.timeout(cfg.timeout) } : undefined,
        });
      } else if (cfg.type === "sse") {
        if (!cfg.url) throw new Error(`falta "url"`);
        const mod = (await import("@modelcontextprotocol/sdk/client/sse.js")) as any;
        transport = new mod.SSEClientTransport(new URL(cfg.url));
      } else {
        throw new Error(`tipo de transporte desconocido: "${(cfg as any).type}"`);
      }

      await client.connect(transport);
      const { tools } = await client.listTools();

      let count = 0;
      for (const tool of (tools ?? []) as Tool[]) {
        const toolName = normalizeToolName(tool.name);
        const name = `${id}_${toolName}`;
        if (registeredTools.has(name)) continue;
        registeredTools.add(name);
        registerMcpTool(id, name, tool);
        count++;
      }

      clients.set(id, { client, transport });
      return count > 0 ? `${id} (${count} tools)` : `${id} (0 tools)`;
    } catch (e) {
      console.error(`[mcp-client] Error conectando al servidor "${id}":`, e);
      return null;
    }
  }

  function registerMcpTool(serverId: string, name: string, tool: Tool) {
    const inputSchema: any = (tool as any).inputSchema ?? {};
    const parameters = jsonSchemaToTypeBox(inputSchema);
    const description =
      (tool.description?.trim()
        ? `${tool.description.trim()}\n\n`
        : `Herramienta del servidor MCP "${serverId}".\n\n`) +
      `(Servidor MCP: ${serverId})`;

    pi.registerTool({
      name,
      label: tool.name,
      description,
      promptSnippet: tool.description?.trim() ?? `Herramienta de ${serverId}`,
      promptGuidelines: [
        `Usa ${name} cuando el usuario pida operaciones del servidor MCP ${serverId}.`,
      ],
      parameters,
      async execute(_toolCallId, args, signal, _onUpdate, ctx) {
        const entry = clients.get(serverId);
        if (!entry) {
          throw new Error(`El servidor MCP "${serverId}" no está conectado. Revisa ~/.pi/mcp-servers.json.`);
        }
        const result = await entry.client.callTool(
          { name: tool.name, arguments: args },
          { signal },
        );
        const text = extractText(result, serverId, tool.name);
        return {
          content: [{ type: "text", text }],
          details: { server: serverId, tool: tool.name },
        };
      },
    });
  }

  async function closeAll() {
    for (const [id, entry] of clients.entries()) {
      try {
        await entry.client.close();
      } catch (e) {
        console.error(`[mcp-client] Error cerrando servidor "${id}":`, e);
      }
    }
    clients.clear();
  }

  // Conectar en el arranque de sesión
  pi.on("session_start", async (_event, ctx) => {
    const config = loadConfig(ctx.cwd);
    const servers = Object.entries(config.servers ?? {}).filter(
      ([, cfg]) => cfg.enabled !== false,
    );

    if (servers.length === 0) {
      ctx.ui.notify(
        "mcp-client: sin servidores. Edita ~/.pi/mcp-servers.json",
        "info",
      );
      return;
    }

    const results = await Promise.all(servers.map(([id, cfg]) => connectServer(id, cfg)));
    const ok = servers.filter((_, i) => results[i] !== null).map(([id], i) => results[i]);
    const failed = servers.filter((_, i) => results[i] === null).map(([id]) => id);

    if (ok.length > 0) {
      ctx.ui.notify(`mcp-client: conectado -> ${ok.join(", ")}`, "info");
    }
    if (failed.length > 0) {
      ctx.ui.notify(`mcp-client: fallo al conectar -> ${failed.join(", ")}`, "warning");
    }
  });

  // Limpiar al cerrar sesión
  pi.on("session_shutdown", async () => {
    await closeAll();
  });

  // Comando /mcp para ver estado
  pi.registerCommand("mcp", {
    description: "Lista los servidores MCP conectados: /mcp",
    handler: async (_args, ctx) => {
      if (clients.size === 0) {
        ctx.ui.notify("mcp-client: no hay servidores conectados", "info");
        return;
      }
      const list = [...clients.keys()].sort();
      const msg = list.map((id) => `- ${id}`).join("\n");
      ctx.ui.select?.("Servidores MCP conectados", list);
      ctx.ui.notify(`mcp-client: ${list.length} servidor(es)\n${msg}`, "info");
    },
  });

  // Comando /mcp reload para reconectar sin reiniciar pi
  pi.registerCommand("mcp-reload", {
    description: "Reconecta los servidores MCP: /mcp-reload",
    handler: async (_args, ctx) => {
      await closeAll();
      registeredTools.clear();
      const config = loadConfig(ctx.cwd);
      const servers = Object.entries(config.servers ?? {}).filter(
        ([, cfg]) => cfg.enabled !== false,
      );
      if (servers.length === 0) {
        ctx.ui.notify("mcp-client: sin servidores configurados", "info");
        return;
      }
      const results = await Promise.all(servers.map(([id, cfg]) => connectServer(id, cfg)));
      const ok = servers.filter((_, i) => results[i] !== null).map((_, i) => results[i]);
      ctx.ui.notify(`mcp-client: reconectados -> ${ok.length}/${servers.length}`, ok.length === servers.length ? "info" : "warning");
    },
  });

  // Manejar entradas estilo /mcp <nombre> para info de un servidor
  pi.on("input", async (event, ctx) => {
    const m = event.text.trim().match(/^\/mcp\s+(.+)$/);
    if (!m) return { action: "continue" as const };
    const id = sanitizeServerId(m[1]);
    const entry = clients.get(id);
    if (!entry) {
      ctx.ui.notify(`mcp-client: servidor "${id}" no conectado. Usa /mcp para listar.`, "warning");
      return { action: "handled" as const };
    }
    ctx.ui.notify(`mcp-client: servidor "${id}" conectado`, "info");
    return { action: "handled" as const };
  });
}
