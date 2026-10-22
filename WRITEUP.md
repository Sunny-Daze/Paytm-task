# Decisions

- I am using only a single endpoint for auth i.e. /auth/login which generates a signed JWT token which upserts a user rather than the traditional signup login flow. I did this becasue this made testing a lot easier.

- I am using postgres for all the atomic decision and is the single source of truth and I am using redis to cache for the hot paths.

- For idempotency I am maintaing a seperate table called idempotency_requests which records the key, operations and other facts which will serve good tracebility.

- The seat flow is hold then confirm. calling the /reserve first claims the idempotency key. If it already exists then i resend the stored response from the idempotency_request table. Acquire lock on the requested seats ordered by id to avoid deadlocks. Inserts a reservation row with with the related details (status, hold_expires_at) and update the seats to held with the reservation_id and also insert the related reservation_items(multiple seats in a single request). Calling /confirm in the that window then confirms that seat for that particular user.

- For thundering herd problem only the first caller loads it and writes to redis and everyone else waits the same promise. All keys have jitter in them so that multiple keys don't expire at the same time.


# AI usage

- For helping me catch my architectural decisions limits so that I can refine before implementation and code generation

- Scripts generation