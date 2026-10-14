FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL https://github.com/openai/codex/releases/download/rust-v0.160.1/codex-x86_64-unknown-linux-musl.tar.gz -o /tmp/codex.tgz \
 && tar -xzf /tmp/codex.tgz -C /tmp && install -m 0755 /tmp/codex-x86_64-unknown-linux-musl /usr/local/bin/codex && rm /tmp/codex.tgz /tmp/codex-x86_64-unknown-linux-musl
WORKDIR /app
COPY src ./src
USER node
ENV PORT=8787 CODEX_BINARY=/usr/local/bin/codex
EXPOSE 8787
CMD ["node","src/server.ts"]
