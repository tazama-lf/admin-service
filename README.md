<!-- SPDX-License-Identifier: Apache-2.0 -->
# Admin Service Documentation

## Overview

The **Admin service** is a Node.js-based API designed for administrative tasks, particularly focusing on report management. It leverages the **Fastify** framework to provide a high-performance and low-overhead API interface. This document provides an in-depth look at the API, including setup requirements, a detailed overview of the application, and specific route documentation.

## Pre-requisites

Before you start using the Admin API, ensure that you have the following items:

1. **Node.js**: Version 20.x or higher.
    - Download from [Node.js Official Website](https://nodejs.org/).
    - Verify installation using `node -v` and `npm -v`.

2. **NPM**: A package manager for Node.js packages.
    - NPM is installed with Node.js.

3. **Git**: Version control system for cloning the repository.
    - Download from [Git Official Website](https://git-scm.com/).

4. **Database**: Arango database setup.
    - Ensure the database is running and accessible from your Node.js environment.

5. **Environment Variables**: Set up environment variables required by the application, such as database connection strings. Typically stored in a `.env` file.

## Installation and Setup

1. **Clone the Repository**:
    ```bash
    git clone https://github.com/@frmscoe/admin-service.git
    cd admin-service
    ```

2. **Install Dependencies**:
    ```bash
    npm install
    ```

3. **Configure Environment Variables**:
    - Create a `.env` file in the root directory and add necessary configuration values

4. **Run the Server**:
    ```bash
    npm start
    ```

5. **Access the API**:
    - The server runs on `http://localhost:3000` by default. You can access the API via your browser or any HTTP client like Postman.

## API Endpoints

### 1. `/v1/admin/reports/getreportbymsgid`

#### Description
This endpoint retrieves a report by the specified message ID (`msgid`). The message ID is provided as a query parameter.

#### Flow Diagram
```mermaid
sequenceDiagram
    participant Client as Client<br>System
    participant ADMIN as Admin-Service    
    participant DB as ArangoDB

Client ->> ADMIN: 1. Fetch evaluationResult
ADMIN->> DB: 2. Fetch evaluationResult 
DB->> ADMIN: 3. {evaluationResult} data
ADMIN->> Client: 4. {evaluationResult} data
```

#### URL
```
/v1/admin/reports/getreportbymsgid
```

#### Method
```
GET
```

#### Query Parameters

| Parameter | Type   | Required | Description                     |
|-----------|--------|----------|---------------------------------|
| `msgid`   | String | Yes      | The message ID to get the report for. |

#### Headers
No specific headers required apart from standard authentication headers if needed.

#### Request Example
```http
GET /v1/admin/reports/getreportbymsgid?msgid=1234567890 HTTP/1.1
Host: localhost:3000
```

#### Response

- **Status 400 Bad Request:** When `msgid` is missing or invalid.
    ```json
    {
      "statusCode": 400,
      "code": "FST_ERR_VALIDATION",
      "error": "Bad Request",
      "message": "querystring must have required property 'msgid'"
    }
    ```

- **Status 204 Not Found:** When no report is found for the given `msgid`.
    ```json
    {
      "statusCode": 204,
    }
    ```

- **Status 500 Internal Server Error:** For server-side errors.
    ```json
    {
      "status": "error",
      "message": "Internal server error occurred."
    }
    ```

