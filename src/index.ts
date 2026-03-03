#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import snowflake from "snowflake-sdk";
import { z } from "zod";

interface SnowflakeRow {
  [key: string]: unknown;
}

const getEnvOrThrow = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const createConnection = (): snowflake.Connection => {
  const authenticator = process.env.SNOWFLAKE_AUTHENTICATOR || "snowflake";

  const config: snowflake.ConnectionOptions = {
    account: getEnvOrThrow("SNOWFLAKE_ACCOUNT"),
    username: getEnvOrThrow("SNOWFLAKE_USERNAME"),
    authenticator,
    role: process.env.SNOWFLAKE_ROLE,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA,
  };

  if (authenticator.toLowerCase() !== "externalbrowser") {
    config.password = getEnvOrThrow("SNOWFLAKE_PASSWORD");
  }

  return snowflake.createConnection(config);
};

const executeQuery = (
  connection: snowflake.Connection,
  query: string
): Promise<SnowflakeRow[]> => {
  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText: query,
      complete: (err, _stmt, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve((rows as SnowflakeRow[]) || []);
        }
      },
    });
  });
};

const connectToSnowflake = (
  connection: snowflake.Connection
): Promise<snowflake.Connection> => {
  const authenticator = process.env.SNOWFLAKE_AUTHENTICATOR || "snowflake";

  if (authenticator.toLowerCase() === "externalbrowser") {
    return new Promise((resolve, reject) => {
      connection.connectAsync((err, conn) => {
        if (err) {
          reject(err);
        } else {
          resolve(conn);
        }
      });
    });
  }

  return new Promise((resolve, reject) => {
    connection.connect((err, conn) => {
      if (err) {
        reject(err);
      } else {
        resolve(conn);
      }
    });
  });
};

const formatResults = (rows: SnowflakeRow[]): string => {
  if (rows.length === 0) {
    return "Query executed successfully. No rows returned.";
  }

  const headers = Object.keys(rows[0]);
  const headerRow = headers.join(" | ");
  const separator = headers.map(() => "---").join(" | ");
  const dataRows = rows.map((row) =>
    headers.map((h) => String(row[h] ?? "NULL")).join(" | ")
  );

  return [headerRow, separator, ...dataRows].join("\n");
};

const main = async () => {
  const server = new McpServer({
    name: "snowflake-mcp",
    version: "1.0.0",
  });

  let connection: snowflake.Connection | null = null;

  server.tool(
    "execute_query",
    "Execute a SQL query against Snowflake and return the results",
    {
      query: z.string().describe("The SQL query to execute"),
    },
    async ({ query }) => {
      try {
        if (!connection) {
          connection = createConnection();
          await connectToSnowflake(connection);
        }

        const rows = await executeQuery(connection, query);
        const formattedResults = formatResults(rows);

        return {
          content: [
            {
              type: "text" as const,
              text: formattedResults,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error executing query: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
