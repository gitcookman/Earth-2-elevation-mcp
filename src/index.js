#!/usr/bin/env node

const SERVER_NAME = "open-elevation-mcp";
const SERVER_VERSION = "0.1.0";
const BASE_URL = (process.env.OPEN_ELEVATION_BASE_URL || "https://api.open-elevation.com").replace(/\/+$/, "");
const LOOKUP_URL = `${BASE_URL}/api/v1/lookup`;
const MAX_LOCATIONS = Number.parseInt(process.env.OPEN_ELEVATION_MAX_LOCATIONS || "100", 10);

const tools = [
  {
    name: "get_elevation",
    description: "Look up elevation in meters for one latitude/longitude point.",
    inputSchema: {
      type: "object",
      properties: {
        latitude: {
          type: "number",
          minimum: -90,
          maximum: 90,
          description: "Latitude in decimal degrees."
        },
        longitude: {
          type: "number",
          minimum: -180,
          maximum: 180,
          description: "Longitude in decimal degrees."
        }
      },
      required: ["latitude", "longitude"],
      additionalProperties: false
    }
  },
  {
    name: "get_elevations",
    description: "Batch look up elevations in meters for multiple latitude/longitude points.",
    inputSchema: {
      type: "object",
      properties: {
        locations: {
          type: "array",
          minItems: 1,
          maxItems: MAX_LOCATIONS,
          items: {
            type: "object",
            properties: {
              latitude: {
                type: "number",
                minimum: -90,
                maximum: 90
              },
              longitude: {
                type: "number",
                minimum: -180,
                maximum: 180
              }
            },
            required: ["latitude", "longitude"],
            additionalProperties: false
          }
        }
      },
      required: ["locations"],
      additionalProperties: false
    }
  },
  {
    name: "get_elevation_profile",
    description: "Sample evenly spaced points between two coordinates and return an elevation profile.",
    inputSchema: {
      type: "object",
      properties: {
        start: {
          type: "object",
          properties: {
            latitude: {
              type: "number",
              minimum: -90,
              maximum: 90
            },
            longitude: {
              type: "number",
              minimum: -180,
              maximum: 180
            }
          },
          required: ["latitude", "longitude"],
          additionalProperties: false
        },
        end: {
          type: "object",
          properties: {
            latitude: {
              type: "number",
              minimum: -90,
              maximum: 90
            },
            longitude: {
              type: "number",
              minimum: -180,
              maximum: 180
            }
          },
          required: ["latitude", "longitude"],
          additionalProperties: false
        },
        samples: {
          type: "integer",
          minimum: 2,
          maximum: MAX_LOCATIONS,
          default: 10,
          description: "Number of evenly spaced samples, including start and end."
        }
      },
      required: ["start", "end"],
      additionalProperties: false
    }
  }
];

function writeJson(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function ok(id, result) {
  writeJson({ jsonrpc: "2.0", id, result });
}

function fail(id, code, message, data) {
  writeJson({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data })
    }
  });
}

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
}

function assertFiniteNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }
}

function normalizeLocation(location, name = "location") {
  assertObject(location, name);
  assertFiniteNumber(location.latitude, `${name}.latitude`);
  assertFiniteNumber(location.longitude, `${name}.longitude`);

  if (location.latitude < -90 || location.latitude > 90) {
    throw new Error(`${name}.latitude must be between -90 and 90.`);
  }

  if (location.longitude < -180 || location.longitude > 180) {
    throw new Error(`${name}.longitude must be between -180 and 180.`);
  }

  return {
    latitude: location.latitude,
    longitude: location.longitude
  };
}

function normalizeLocations(locations) {
  if (!Array.isArray(locations) || locations.length === 0) {
    throw new Error("locations must be a non-empty array.");
  }

  if (locations.length > MAX_LOCATIONS) {
    throw new Error(`locations cannot contain more than ${MAX_LOCATIONS} points.`);
  }

  return locations.map((location, index) => normalizeLocation(location, `locations[${index}]`));
}

function interpolateProfile(start, end, samples) {
  const count = samples === undefined ? 10 : samples;

  if (!Number.isInteger(count) || count < 2 || count > MAX_LOCATIONS) {
    throw new Error(`samples must be an integer between 2 and ${MAX_LOCATIONS}.`);
  }

  return Array.from({ length: count }, (_, index) => {
    const ratio = index / (count - 1);

    return {
      latitude: start.latitude + (end.latitude - start.latitude) * ratio,
      longitude: start.longitude + (end.longitude - start.longitude) * ratio
    };
  });
}

async function lookupElevations(locations) {
  const response = await fetch(LOOKUP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ locations })
  });

  const bodyText = await response.text();
  let body;

  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    body = { raw: bodyText };
  }

  if (!response.ok) {
    throw new Error(`Open-Elevation returned HTTP ${response.status}: ${JSON.stringify(body)}`);
  }

  if (!body || !Array.isArray(body.results)) {
    throw new Error(`Open-Elevation returned an unexpected response: ${JSON.stringify(body)}`);
  }

  return body.results;
}

function toolContent(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

async function callTool(name, args = {}) {
  if (name === "get_elevation") {
    const location = normalizeLocation(args, "input");
    const [result] = await lookupElevations([location]);
    return toolContent(result);
  }

  if (name === "get_elevations") {
    const locations = normalizeLocations(args.locations);
    const results = await lookupElevations(locations);
    return toolContent({ results });
  }

  if (name === "get_elevation_profile") {
    const start = normalizeLocation(args.start, "start");
    const end = normalizeLocation(args.end, "end");
    const locations = interpolateProfile(start, end, args.samples);
    const results = await lookupElevations(locations);

    return toolContent({
      start,
      end,
      samples: locations.length,
      results: results.map((result, index) => ({
        sample: index,
        distanceFraction: locations.length === 1 ? 0 : index / (locations.length - 1),
        ...result
      }))
    });
  }

  throw new Error(`Unknown tool: ${name}`);
}

async function handleRequest(message) {
  const { id, method, params } = message;

  if (method === "initialize") {
    ok(id, {
      protocolVersion: params?.protocolVersion || "2024-11-05",
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION
      }
    });
    return;
  }

  if (method === "tools/list") {
    ok(id, { tools });
    return;
  }

  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments || {};

    if (typeof name !== "string") {
      throw new Error("tools/call requires params.name.");
    }

    ok(id, await callTool(name, args));
    return;
  }

  if (method === "ping") {
    ok(id, {});
    return;
  }

  if (method?.startsWith("notifications/")) {
    return;
  }

  fail(id, -32601, `Method not found: ${method}`);
}

let buffer = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;

  let newlineIndex;
  while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);

    if (!line) {
      continue;
    }

    void (async () => {
      let message;

      try {
        message = JSON.parse(line);
      } catch (error) {
        fail(null, -32700, "Parse error", error.message);
        return;
      }

      try {
        await handleRequest(message);
      } catch (error) {
        fail(message.id ?? null, -32603, error.message);
      }
    })();
  }
});

