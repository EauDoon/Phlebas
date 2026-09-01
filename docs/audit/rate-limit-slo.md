# Rate limiter SLO

This document is the SLO for the per-IP rate limiter. The
rate limiter is wired into the matcher and atomic-swap
observer services in `feat/rate-limit-wiring`.

## Configuration

| Service | Capacity | Refill per second | Source |
| --- | --- | --- | --- |
| matcher | 60 | 1 | `services/matcher/server.ts` |
| observer | 60 | 1 | `services/atomic-swap-observer/server.ts` |

The capacity and refill rate are the defaults; the production
deploy can override them via environment variables.

## Behavior

* The rate limiter extracts the client key from the
  `X-Forwarded-For` header (first hop), the `X-Real-IP`
  header, or the socket's remote address. The order is
  `X-Forwarded-For` first, then `X-Real-IP`, then the socket
  address.
* The rate limiter uses a per-key token bucket. Each key gets
  its own bucket.
* When a request is allowed, the response includes
  `X-RateLimit-Remaining`.
* When a request is rejected, the response is 429 with
  `Retry-After` and `X-RateLimit-Remaining` headers.

## SLO

* Latency: the rate limiter adds less than 1 millisecond to
  each request.
* Availability: the rate limiter never rejects a request
  unless the per-key bucket is drained. The refill rate
  guarantees a long-term rate of `refillPerSecond` per key.
* Memory: the rate limiter holds one bucket per key. The
  bucket is small (a few hundred bytes). The total memory
  grows linearly with the number of distinct keys.
