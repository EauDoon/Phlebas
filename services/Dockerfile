FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY services ./services
ENV PHLEBAS_BIND=0.0.0.0
EXPOSE 8788
