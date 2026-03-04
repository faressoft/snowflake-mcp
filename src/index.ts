#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import snowflake from "snowflake-sdk";
import { z } from "zod";

interface SnowflakeRow {
  [key: string]: unknown;
}

interface QueryResult {
  rows: SnowflakeRow[];
  rowCount: number;
  executionTimeMs: number;
  truncated: boolean;
  totalRowCount?: number;
}

const isReadonlyMode = (): boolean => {
  return process.env.SNOWFLAKE_READONLY?.toLowerCase() === "true";
};

const isWriteQuery = (query: string): boolean => {
  const writePatterns = [
    /^\s*(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|CREATE|ALTER|GRANT|REVOKE|COPY\s+INTO)/i,
  ];
  return writePatterns.some((pattern) => pattern.test(query.trim()));
};

const getEnvOrThrow = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const createConnection = (): snowflake.Connection => {
  const authenticator = process.env.SNOWFLAKE_AUTHENTICATOR || "externalbrowser";

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

const executeQuery = async (
  connection: snowflake.Connection,
  query: string,
  timeout?: number
): Promise<SnowflakeRow[]> => {
  if (timeout) {
    await new Promise<void>((resolve, reject) => {
      connection.execute({
        sqlText: `ALTER SESSION SET STATEMENT_TIMEOUT_IN_SECONDS = ${timeout}`,
        complete: (err) => {
          if (err) reject(err);
          else resolve();
        },
      });
    });
  }

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
  const authenticator = process.env.SNOWFLAKE_AUTHENTICATOR || "externalbrowser";

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

const formatAsTable = (rows: SnowflakeRow[]): string => {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const headerRow = headers.join(" | ");
  const separator = headers.map(() => "---").join(" | ");
  const dataRows = rows.map((row) =>
    headers.map((h) => String(row[h] ?? "NULL")).join(" | ")
  );

  return [headerRow, separator, ...dataRows].join("\n");
};

const formatAsJson = (rows: SnowflakeRow[]): string => {
  return JSON.stringify(rows, null, 2);
};

const formatAsCsv = (rows: SnowflakeRow[]): string => {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const headerRow = headers.map((h) => `"${h}"`).join(",");
  const dataRows = rows.map((row) =>
    headers
      .map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return "";
        const str = String(val);
        return `"${str.replace(/"/g, '""')}"`;
      })
      .join(",")
  );

  return [headerRow, ...dataRows].join("\n");
};

const formatResults = (
  result: QueryResult,
  format: "table" | "json" | "csv" = "table"
): string => {
  const parts: string[] = [];

  if (result.rows.length === 0) {
    parts.push("Query executed successfully. No rows returned.");
  } else {
    switch (format) {
      case "json":
        parts.push(formatAsJson(result.rows));
        break;
      case "csv":
        parts.push(formatAsCsv(result.rows));
        break;
      default:
        parts.push(formatAsTable(result.rows));
    }
  }

  const metadata: string[] = [];
  metadata.push(`Rows: ${result.rowCount}`);

  if (result.truncated && result.totalRowCount) {
    metadata.push(`(showing ${result.rowCount} of ${result.totalRowCount})`);
  } else if (result.truncated) {
    metadata.push(`(truncated to ${result.rowCount} rows)`);
  }

  metadata.push(`Execution time: ${result.executionTimeMs}ms`);

  parts.push("");
  parts.push(`--- ${metadata.join(" | ")} ---`);

  return parts.join("\n");
};

const main = async () => {
  const server = new McpServer({
    name: "snowflake-mcp",
    version: "1.1.0",
  });

  let connection: snowflake.Connection | null = null;

  const ensureConnection = async (): Promise<snowflake.Connection> => {
    if (!connection) {
      connection = createConnection();
      await connectToSnowflake(connection);
    }
    return connection;
  };

  const runQuery = async (
    query: string,
    maxRows?: number,
    timeout?: number
  ): Promise<QueryResult> => {
    const conn = await ensureConnection();
    const startTime = Date.now();
    const rows = await executeQuery(conn, query, timeout);
    const executionTimeMs = Date.now() - startTime;

    const totalRowCount = rows.length;
    const truncated = maxRows !== undefined && rows.length > maxRows;
    const limitedRows = truncated ? rows.slice(0, maxRows) : rows;

    return {
      rows: limitedRows,
      rowCount: limitedRows.length,
      executionTimeMs,
      truncated,
      totalRowCount: truncated ? totalRowCount : undefined,
    };
  };

  // Test Connection Tool
  server.tool(
    "test_connection",
    "Test the connection to Snowflake and return connection info",
    {},
    async () => {
      try {
        const conn = await ensureConnection();
        const result = await runQuery("SELECT CURRENT_USER() as user, CURRENT_ROLE() as role, CURRENT_WAREHOUSE() as warehouse, CURRENT_DATABASE() as database, CURRENT_SCHEMA() as schema, CURRENT_VERSION() as version");

        const info = result.rows[0] || {};
        return {
          content: [
            {
              type: "text" as const,
              text: `Connection successful!\n\nUser: ${info.USER}\nRole: ${info.ROLE}\nWarehouse: ${info.WAREHOUSE}\nDatabase: ${info.DATABASE}\nSchema: ${info.SCHEMA}\nSnowflake Version: ${info.VERSION}\nReadonly Mode: ${isReadonlyMode() ? "Enabled" : "Disabled"}`,
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
              text: `Connection failed: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Execute Query Tool (Enhanced)
  server.tool(
    "execute_query",
    "Execute a SQL query against Snowflake and return the results",
    {
      query: z.string().describe("The SQL query to execute"),
      max_rows: z
        .number()
        .optional()
        .default(100)
        .describe("Maximum number of rows to return (default: 100)"),
      timeout: z
        .number()
        .optional()
        .describe("Query timeout in seconds"),
      format: z
        .enum(["table", "json", "csv"])
        .optional()
        .default("table")
        .describe("Output format: table, json, or csv (default: table)"),
    },
    async ({ query, max_rows, timeout, format }) => {
      try {
        if (isReadonlyMode() && isWriteQuery(query)) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: Write operations are disabled. The server is running in readonly mode (SNOWFLAKE_READONLY=true).",
              },
            ],
            isError: true,
          };
        }

        const result = await runQuery(query, max_rows, timeout);
        const formattedResults = formatResults(result, format);

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

  // Explain Query Tool
  server.tool(
    "explain_query",
    "Get the execution plan for a SQL query without running it",
    {
      query: z.string().describe("The SQL query to explain"),
    },
    async ({ query }) => {
      try {
        const result = await runQuery(`EXPLAIN ${query}`);
        return {
          content: [
            {
              type: "text" as const,
              text: formatAsTable(result.rows),
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
              text: `Error explaining query: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // List Databases Tool
  server.tool(
    "list_databases",
    "List all accessible databases in Snowflake",
    {},
    async () => {
      try {
        const result = await runQuery("SHOW DATABASES", 1000);
        const databases = result.rows.map((row) => ({
          name: row.name,
          owner: row.owner,
          created_on: row.created_on,
          comment: row.comment,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: formatAsTable(databases),
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
              text: `Error listing databases: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // List Schemas Tool
  server.tool(
    "list_schemas",
    "List all schemas in a database",
    {
      database: z
        .string()
        .optional()
        .describe("Database name (uses current database if not specified)"),
    },
    async ({ database }) => {
      try {
        const query = database
          ? `SHOW SCHEMAS IN DATABASE "${database}"`
          : "SHOW SCHEMAS";
        const result = await runQuery(query, 1000);
        const schemas = result.rows.map((row) => ({
          name: row.name,
          database_name: row.database_name,
          owner: row.owner,
          created_on: row.created_on,
          comment: row.comment,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: formatAsTable(schemas),
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
              text: `Error listing schemas: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // List Tables Tool
  server.tool(
    "list_tables",
    "List all tables in a schema",
    {
      database: z.string().optional().describe("Database name"),
      schema: z.string().optional().describe("Schema name"),
    },
    async ({ database, schema }) => {
      try {
        let query = "SHOW TABLES";
        if (database && schema) {
          query = `SHOW TABLES IN "${database}"."${schema}"`;
        } else if (schema) {
          query = `SHOW TABLES IN SCHEMA "${schema}"`;
        }

        const result = await runQuery(query, 1000);
        const tables = result.rows.map((row) => ({
          name: row.name,
          database_name: row.database_name,
          schema_name: row.schema_name,
          kind: row.kind,
          rows: row.rows,
          bytes: row.bytes,
          owner: row.owner,
          created_on: row.created_on,
          comment: row.comment,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: formatAsTable(tables),
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
              text: `Error listing tables: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // List Views Tool
  server.tool(
    "list_views",
    "List all views in a schema",
    {
      database: z.string().optional().describe("Database name"),
      schema: z.string().optional().describe("Schema name"),
    },
    async ({ database, schema }) => {
      try {
        let query = "SHOW VIEWS";
        if (database && schema) {
          query = `SHOW VIEWS IN "${database}"."${schema}"`;
        } else if (schema) {
          query = `SHOW VIEWS IN SCHEMA "${schema}"`;
        }

        const result = await runQuery(query, 1000);
        const views = result.rows.map((row) => ({
          name: row.name,
          database_name: row.database_name,
          schema_name: row.schema_name,
          owner: row.owner,
          created_on: row.created_on,
          comment: row.comment,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: formatAsTable(views),
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
              text: `Error listing views: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Describe Table Tool
  server.tool(
    "describe_table",
    "Get detailed information about a table's structure including columns, types, and constraints",
    {
      table: z.string().describe("Table name (can include database.schema.table)"),
    },
    async ({ table }) => {
      try {
        const result = await runQuery(`DESCRIBE TABLE ${table}`, 1000);
        const columns = result.rows.map((row) => ({
          name: row.name,
          type: row.type,
          nullable: row["null?"],
          default: row.default,
          primary_key: row["primary key"],
          unique_key: row["unique key"],
          comment: row.comment,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: `Table: ${table}\n\n${formatAsTable(columns)}`,
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
              text: `Error describing table: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Get Table Sample Tool
  server.tool(
    "get_table_sample",
    "Get a sample of rows from a table to understand its data",
    {
      table: z.string().describe("Table name (can include database.schema.table)"),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe("Number of sample rows to return (default: 5)"),
    },
    async ({ table, limit }) => {
      try {
        const result = await runQuery(`SELECT * FROM ${table} LIMIT ${limit}`, limit);
        return {
          content: [
            {
              type: "text" as const,
              text: `Sample data from ${table}:\n\n${formatAsTable(result.rows)}`,
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
              text: `Error getting table sample: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Get Table Row Count Tool
  server.tool(
    "get_table_row_count",
    "Get the total number of rows in a table",
    {
      table: z.string().describe("Table name (can include database.schema.table)"),
    },
    async ({ table }) => {
      try {
        const result = await runQuery(`SELECT COUNT(*) as row_count FROM ${table}`);
        const count = result.rows[0]?.ROW_COUNT ?? result.rows[0]?.row_count ?? 0;
        return {
          content: [
            {
              type: "text" as const,
              text: `Table ${table} has ${count.toLocaleString()} rows`,
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
              text: `Error getting row count: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Get Primary Keys Tool
  server.tool(
    "get_primary_keys",
    "Get primary key columns for a table",
    {
      table: z.string().describe("Table name (can include database.schema.table)"),
    },
    async ({ table }) => {
      try {
        const result = await runQuery(`SHOW PRIMARY KEYS IN TABLE ${table}`, 100);
        if (result.rows.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No primary key defined for table ${table}`,
              },
            ],
          };
        }

        const keys = result.rows.map((row) => ({
          column_name: row.column_name,
          key_sequence: row.key_sequence,
          constraint_name: row.constraint_name,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: `Primary keys for ${table}:\n\n${formatAsTable(keys)}`,
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
              text: `Error getting primary keys: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // MCP Resource: Current Schema
  server.resource(
    "schema://current",
    "Current database schema information",
    async () => {
      try {
        await ensureConnection();

        const contextResult = await runQuery(
          "SELECT CURRENT_DATABASE() as db, CURRENT_SCHEMA() as schema"
        );
        const context = contextResult.rows[0] || {};

        const tablesResult = await runQuery("SHOW TABLES", 1000);
        const tables = tablesResult.rows.map((row) => row.name);

        const viewsResult = await runQuery("SHOW VIEWS", 1000);
        const views = viewsResult.rows.map((row) => row.name);

        const schemaInfo = {
          database: context.DB || context.db,
          schema: context.SCHEMA || context.schema,
          tables,
          views,
        };

        return {
          contents: [
            {
              uri: "schema://current",
              mimeType: "application/json",
              text: JSON.stringify(schemaInfo, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          contents: [
            {
              uri: "schema://current",
              mimeType: "text/plain",
              text: `Error fetching schema: ${errorMessage}`,
            },
          ],
        };
      }
    }
  );

  // MCP Prompt: Analyze Table
  server.prompt(
    "analyze_table",
    "Analyze a table's structure, sample data, and suggest useful queries",
    {
      table_name: z.string().describe("The table to analyze"),
    },
    async ({ table_name }) => {
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Please analyze the table "${table_name}" by:
1. Describing its structure (columns, types, constraints)
2. Showing a sample of the data (5-10 rows)
3. Getting the total row count
4. Suggesting 3-5 useful queries that could be run against this table based on its structure

Use the available Snowflake tools to gather this information.`,
            },
          },
        ],
      };
    }
  );

  // MCP Prompt: Explore Database
  server.prompt(
    "explore_database",
    "Explore and summarize the structure of a database",
    {
      database_name: z
        .string()
        .optional()
        .describe("The database to explore (uses current if not specified)"),
    },
    async ({ database_name }) => {
      const dbClause = database_name ? ` "${database_name}"` : " the current database";
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Please explore${dbClause} by:
1. Listing all schemas
2. For each schema, listing the tables and views
3. Providing a summary of the database structure
4. Highlighting any tables that appear to be important (based on naming or size)

Use the available Snowflake tools to gather this information.`,
            },
          },
        ],
      };
    }
  );

  // MCP Prompt: Query Builder
  server.prompt(
    "query_builder",
    "Help build a SQL query based on natural language description",
    {
      description: z.string().describe("Natural language description of what you want to query"),
      tables: z
        .string()
        .optional()
        .describe("Comma-separated list of relevant tables (optional)"),
    },
    async ({ description, tables }) => {
      const tableClause = tables
        ? `\nRelevant tables to consider: ${tables}`
        : "";
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `I need help building a SQL query for Snowflake.

Request: ${description}${tableClause}

Please:
1. First, explore the relevant table structures using describe_table
2. Build the appropriate SQL query
3. Explain the query logic
4. Execute the query and show results

If you need more context about available tables, use list_tables first.`,
            },
          },
        ],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
