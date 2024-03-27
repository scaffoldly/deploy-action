### 🚀 Deploying `{%= commitSha %}` to `{%= stage %}`...

- **Commit:** `{%= commitSha %}`
- **Stage:** `{%= stage %}`
- **URL:** _pending_

{% if (logsUrl) { %}

<details>
<summary>[Deploy Log]({%= logsUrl %})</summary>

```
Logs will appear here once the GitHub Action finishes.
```

</details>

{% } %}
