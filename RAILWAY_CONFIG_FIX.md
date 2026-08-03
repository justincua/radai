# Railway config fix v3.8.1

Railway initialization failed because `overlapSeconds` and `drainingSeconds`
were strings instead of JSON numbers.

Incorrect:

```json
"overlapSeconds": "0",
"drainingSeconds": "15"
```

Correct:

```json
"overlapSeconds": 0,
"drainingSeconds": 15
```

Commit and push this source again to trigger a new Railway deployment.
