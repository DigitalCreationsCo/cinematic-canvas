## 🐞 Debugging & Concurrency

This application is architected for **Massively Concurrent** operations. It utilizes distributed locking and strict timeout policies to maintain database health in production. However, these safety mechanisms can interfere with local debugging (breakpoints).

### How to Debug Safely
If you need to use breakpoints or step-through debugging, you **must** disable the strict circuit breakers and timeouts.

1.  Open your `.env` file.
2.  Set the following flag:
    ```bash
    DISABLE_DB_CIRCUIT_BREAKER=true
    ```
3.  Restart your development server.

**What this does:**
* Sets database connection timeouts to `Infinity`.
* Disables the application-side Circuit Breaker pattern.
* Prevents `Circuit breaker open: Too many authentication errors` when resuming from a breakpoint.