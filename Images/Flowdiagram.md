```mermaid
sequenceDiagram
    participant Requester
    participant Admin-service
    participant ArangoDB

    Requester->>+Admin-service: Request for report by msgid
    Admin-service->>+ArangoDB: Get report Filter by msgid

    ArangoDB->>+Admin-service: report if (found)
    Admin-service-->>Requester: response with report if found
```
