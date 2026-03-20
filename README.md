<p align="center">
  <img src="assets/logo-600.png" alt="Snowflake MCP" width="600">
</p>

# Snowflake MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that enables AI agents to execute SQL queries against Snowflake databases.

Users can use natural language to query Snowflake databases, like:

- "Get me the top 10 products by revenue"
- "Show me the total revenue for the last 30 days"
- "Describe the structure of the orders table"
- "Explore the database and summarize what data is available"
- "Build a query to find customers who haven't ordered in 90 days"

## Features

- Execute SQL queries directly from AI agents like Cursor, Claude Desktop, etc.
- **Schema Discovery**: Browse databases, schemas, tables, and views
- **Table Inspection**: Describe table structures, view sample data, check row counts
- **Query Safety**: Readonly mode, row limits, and query timeouts
- **Multiple Output Formats**: Table, JSON, or CSV
- **Query Explanation**: Get execution plans for queries
- **MCP Prompts**: Guided workflows for common tasks
- Support for password, SSO (browser-based), and key-pair (JWT) authentication
- Configurable default warehouse, database, schema, and role

## Prerequisites

- Node.js 18 or later

## Usage

### Cursor

Add to your Cursor MCP settings (`~/.cursor/mcp.json`):

#### SSO Authentication (Recommended)

```json
{
  "mcpServers": {
    "snowflake": {
      "command": "npx",
      "args": ["-y", "snowflake-mcp"],
      "env": {
        "SNOWFLAKE_ACCOUNT": "your-org-your-account",
        "SNOWFLAKE_USERNAME": "your-username",
        "SNOWFLAKE_AUTHENTICATOR": "externalbrowser",
        "SNOWFLAKE_WAREHOUSE": "your-warehouse",
        "SNOWFLAKE_DATABASE": "your-database",
        "SNOWFLAKE_SCHEMA": "your-schema"
      }
    }
  }
}
```

A browser window will open for authentication on first query.

#### Password Authentication

```json
{
  "mcpServers": {
    "snowflake": {
      "command": "npx",
      "args": ["-y", "snowflake-mcp"],
      "env": {
        "SNOWFLAKE_ACCOUNT": "your-org-your-account",
        "SNOWFLAKE_USERNAME": "your-username",
        "SNOWFLAKE_PASSWORD": "your-password",
        "SNOWFLAKE_ROLE": "your-role",
        "SNOWFLAKE_WAREHOUSE": "your-warehouse",
        "SNOWFLAKE_DATABASE": "your-database",
        "SNOWFLAKE_SCHEMA": "your-schema",
        "SNOWFLAKE_READONLY": "true"
      }
    }
  }
}
```

#### Key-Pair Authentication (Service Accounts / MFA environments)

Use this when you are authenticating with a private key (`.p8` or `.pem`).

```json
{
  "mcpServers": {
    "snowflake": {
      "command": "npx",
      "args": ["-y", "snowflake-mcp"],
      "env": {
        "SNOWFLAKE_ACCOUNT": "your-org-your-account",
        "SNOWFLAKE_USERNAME": "your-username",
        "SNOWFLAKE_PRIVATE_KEY_PATH": "/path/to/your/private_key.p8",
        "SNOWFLAKE_ROLE": "your-role",
        "SNOWFLAKE_WAREHOUSE": "your-warehouse",
        "SNOWFLAKE_DATABASE": "your-database",
        "SNOWFLAKE_SCHEMA": "your-optional-schema",
        "SNOWFLAKE_READONLY": "true"
      }
    }
  }
}
```

If your private key is encrypted, also set `SNOWFLAKE_PRIVATE_KEY_PASSPHRASE`. If you prefer to supply the key contents directly instead of a file path, use `SNOWFLAKE_PRIVATE_KEY` with the raw PEM string.

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "snowflake": {
      "command": "npx",
      "args": ["-y", "snowflake-mcp"],
      "env": {
        "SNOWFLAKE_ACCOUNT": "your-org-your-account",
        "SNOWFLAKE_USERNAME": "your-username",
        "SNOWFLAKE_AUTHENTICATOR": "externalbrowser"
      }
    }
  }
}
```

## Configuration

| Variable                  | Required    | Default           | Description                                                                |
| ------------------------- | ----------- | ----------------- | -------------------------------------------------------------------------- |
| `SNOWFLAKE_ACCOUNT`       | Yes         | -                 | Your Snowflake account identifier (e.g., `ORG-ACCOUNT`)                    |
| `SNOWFLAKE_USERNAME`      | Yes         | -                 | Snowflake username                                                         |
| `SNOWFLAKE_AUTHENTICATOR`         | No          | `externalbrowser` | Authentication method: `externalbrowser` (SSO), `snowflake` (password), or `SNOWFLAKE_JWT` (key-pair). Defaults to `SNOWFLAKE_JWT` when a private key is provided. |
| `SNOWFLAKE_PASSWORD`              | Conditional | -                 | Required when authenticator is `snowflake`. Not used for SSO or key-pair.  |
| `SNOWFLAKE_PRIVATE_KEY_PATH`      | Conditional | -                 | Path to a private key file (`.p8` or `.pem`). Required for `SNOWFLAKE_JWT` if `SNOWFLAKE_PRIVATE_KEY` is not set. |
| `SNOWFLAKE_PRIVATE_KEY`           | Conditional | -                 | Raw PEM private key string. Alternative to `SNOWFLAKE_PRIVATE_KEY_PATH`. Cannot be used together with it. |
| `SNOWFLAKE_PRIVATE_KEY_PASSPHRASE`| No          | -                 | Passphrase for an encrypted private key. Omit if your key has no passphrase. |
| `SNOWFLAKE_ROLE`          | No          | -                 | Role to use for the session (uses account default if not set)              |
| `SNOWFLAKE_WAREHOUSE`     | No          | -                 | Warehouse to use (uses account default if not set)                         |
| `SNOWFLAKE_DATABASE`      | No          | -                 | Database to use (uses account default if not set)                          |
| `SNOWFLAKE_SCHEMA`        | No          | -                 | Schema to use (uses account default if not set)                            |
| `SNOWFLAKE_READONLY`      | No          | `false`           | Set to `true` to block write operations (INSERT, UPDATE, DELETE, etc.)     |

### Finding Your Connection Settings

You can find your connection settings in Snowsight (Snowflake's web interface):

1. Sign in to [Snowsight](https://app.snowflake.com/)
2. Click on your username in the bottom-left corner to open the user menu
3. Select **Connect a tool to Snowflake**
4. Open the `Config File` tab
5. Select the Warehouse, Database, Schema you want to use
6. Copy values from the generated config file

## Available Tools

### Query Execution

#### `execute_query`

Execute a SQL query against Snowflake.

| Parameter  | Type   | Required | Default | Description                              |
| ---------- | ------ | -------- | ------- | ---------------------------------------- |
| `query`    | string | Yes      | -       | The SQL query to execute                 |
| `max_rows` | number | No       | 100     | Maximum number of rows to return         |
| `timeout`  | number | No       | -       | Query timeout in seconds                 |
| `format`   | string | No       | table   | Output format: `table`, `json`, or `csv` |

#### `explain_query`

Get the execution plan for a SQL query without running it.

| Parameter | Type   | Required | Description              |
| --------- | ------ | -------- | ------------------------ |
| `query`   | string | Yes      | The SQL query to explain |

### Connection

#### `test_connection`

Test the connection to Snowflake and return connection info including current user, role, warehouse, database, schema, and version.

### Schema Discovery

#### `list_databases`

List all accessible databases in Snowflake.

#### `list_schemas`

List all schemas in a database.

| Parameter  | Type   | Required | Description                                   |
| ---------- | ------ | -------- | --------------------------------------------- |
| `database` | string | No       | Database name (uses current if not specified) |

#### `list_tables`

List all tables in a schema.

| Parameter  | Type   | Required | Description   |
| ---------- | ------ | -------- | ------------- |
| `database` | string | No       | Database name |
| `schema`   | string | No       | Schema name   |

#### `list_views`

List all views in a schema.

| Parameter  | Type   | Required | Description   |
| ---------- | ------ | -------- | ------------- |
| `database` | string | No       | Database name |
| `schema`   | string | No       | Schema name   |

### Table Inspection

#### `describe_table`

Get detailed information about a table's structure including columns, types, and constraints.

| Parameter | Type   | Required | Description                                    |
| --------- | ------ | -------- | ---------------------------------------------- |
| `table`   | string | Yes      | Table name (can include database.schema.table) |

#### `get_table_sample`

Get a sample of rows from a table to understand its data.

| Parameter | Type   | Required | Default | Description                     |
| --------- | ------ | -------- | ------- | ------------------------------- |
| `table`   | string | Yes      | -       | Table name                      |
| `limit`   | number | No       | 5       | Number of sample rows to return |

#### `get_table_row_count`

Get the total number of rows in a table.

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `table`   | string | Yes      | Table name  |

#### `get_primary_keys`

Get primary key columns for a table.

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `table`   | string | Yes      | Table name  |

## MCP Resources

### `schema://current`

Returns information about the current database schema, including:
- Current database and schema names
- List of all tables
- List of all views

Access this resource to get a quick overview of the connected schema without running queries.

## MCP Prompts

### `analyze_table`

Analyze a table's structure, sample data, and get query suggestions.

| Parameter    | Type   | Required | Description          |
| ------------ | ------ | -------- | -------------------- |
| `table_name` | string | Yes      | The table to analyze |

### `explore_database`

Explore and summarize the structure of a database.

| Parameter       | Type   | Required | Description                                         |
| --------------- | ------ | -------- | --------------------------------------------------- |
| `database_name` | string | No       | Database to explore (uses current if not specified) |

### `query_builder`

Help build a SQL query based on natural language description.

| Parameter     | Type   | Required | Description                                   |
| ------------- | ------ | -------- | --------------------------------------------- |
| `description` | string | Yes      | Natural language description of desired query |
| `tables`      | string | No       | Comma-separated list of relevant tables       |

## Security Considerations

- **SSO authentication** is recommended for production use as it avoids storing passwords in configuration files
- **Readonly mode** (`SNOWFLAKE_READONLY=true`) is recommended when you only need to query data
- Never commit configuration files containing credentials to version control
- Consider using environment variables or a secrets manager for sensitive values
- The server executes queries with the permissions of the configured Snowflake user—ensure appropriate access controls are in place
- The `max_rows` parameter helps prevent accidentally returning massive result sets

## License

MIT License
