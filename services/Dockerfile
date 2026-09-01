FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY src/lib/atomic-swap-plan.ts src/lib/eip712-order.ts src/lib/keccak.ts src/lib/mainnet-assets.ts src/lib/matcher-account-recovery.ts src/lib/matcher-auth.ts src/lib/matcher-feeds.ts src/lib/matcher-http.ts src/lib/matcher-routing.ts src/lib/metrics.ts src/lib/native-zec-usdc-matcher-manifest.ts src/lib/native-zec-usdt-matcher-manifest.ts src/lib/operator-url.ts src/lib/order-domain.ts src/lib/order-lifecycle.ts src/lib/order-policy.ts src/lib/order-receipts.ts src/lib/order-reference.ts src/lib/persistent-matcher.ts src/lib/price-time.ts src/lib/rate-limit-http.ts src/lib/rate-limit.ts src/lib/secp256k1.ts src/lib/slo-tracker.ts src/lib/solver-quotes.ts src/lib/zcash-address.ts ./src/lib/
COPY services/durable-file.ts ./services/durable-file.ts
COPY services/matcher/server.ts services/matcher/journal.ts services/matcher/native-zec-usdc-configuration.ts services/matcher/persistent-store.ts services/matcher/strict-json.ts ./services/matcher/
COPY infra/matcher/native-zec-usdc.json ./infra/matcher/native-zec-usdc.json
COPY infra/matcher/native-zec-usdt.json ./infra/matcher/native-zec-usdt.json
ENV PHLEBAS_BIND=0.0.0.0
EXPOSE 8788
