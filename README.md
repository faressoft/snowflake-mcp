# Snowflake MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that enables AI agents to execute SQL queries against Snowflake databases.

Users can use natural language to query Snowflake databases, like:

- "Get me the top 10 products by revenue"
- "Show me the total revenue for the last 30 days"
- "Show tables in the database"
- "Describe the table structure"
- "Sort the products by revenue in descending order"

## Features

- Execute SQL queries directly from AI agents like Cursor, Claude Desktop, etc.
- Support for both password and SSO (browser-based) authentication
- Configurable default warehouse, database, schema, and role
- Seamless integration with Cursor, Claude Desktop, and other MCP-compatible agents

## Prerequisites

- Node.js 18 or later
- A Snowflake account with appropriate access credentials

## Installation

### Using npx (Recommended)

No installation required—run directly:

```bash
npx snowflake-mcp
```

### From Source

```bash
git clone https://github.com/faressoft/snowflake-mcp.git
cd snowflake-mcp
npm install
npm run build
```

## Configuration

Configure the server using environment variables:

| Variable                  | Required    | Description                                                                |
| ------------------------- | ----------- | -------------------------------------------------------------------------- |
| `SNOWFLAKE_ACCOUNT`       | Yes         | Your Snowflake account identifier (e.g., `ORG-ACCOUNT`)                    |
| `SNOWFLAKE_USERNAME`      | Yes         | Snowflake username                                                         |
| `SNOWFLAKE_AUTHENTICATOR` | No          | Authentication method: `snowflake` (default) or `externalbrowser` (SSO)    |
| `SNOWFLAKE_PASSWORD`      | Conditional | Required if authenticator is `snowflake`, not needed for `externalbrowser` |
| `SNOWFLAKE_ROLE`          | No          | Role to use for the session                                                |
| `SNOWFLAKE_WAREHOUSE`     | No          | Default warehouse to use                                                   |
| `SNOWFLAKE_DATABASE`      | No          | Default database to use                                                    |
| `SNOWFLAKE_SCHEMA`        | No          | Default schema to use                                                      |

### Finding Your Connection Settings

You can find your connection settings in Snowsight (Snowflake's web interface):

1. Sign in to [Snowsight](https://app.snowflake.com/)
2. Click on your username in the bottom-left corner to open the user menu
3. Select **Connect a tool to Snowflake**
4. Open the `Config File` tab
5. Select the Warehouse, Database, Schema you want to use
6. Copy values from the generated config file

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
        "SNOWFLAKE_SCHEMA": "your-schema"
      }
    }
  }
}
```

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

## Available Tools

### execute_query

Execute a SQL query against Snowflake.

**Parameters:**

| Parameter | Type   | Required | Description              |
| --------- | ------ | -------- | ------------------------ |
| `query`   | string | Yes      | The SQL query to execute |

## Security Considerations

- **SSO authentication** is recommended for production use as it avoids storing passwords in configuration files
- Never commit configuration files containing credentials to version control
- Consider using environment variables or a secrets manager for sensitive values
- The server executes queries with the permissions of the configured Snowflake user—ensure appropriate access controls are in place

## License

MIT License
