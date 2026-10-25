# Build from the repository root: docker build -f apps/api/Dockerfile .
FROM rust:1.99.1-slim-bookworm AS builder
WORKDIR /source
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY apps/api ./apps/api
RUN cargo build --release --locked --package reactcoach-api

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home reactcoach
COPY --from=builder /source/target/release/reactcoach-api /usr/local/bin/reactcoach-api
USER 10001:10001
ENV PORT=8080 RUST_LOG=info
EXPOSE 8080
CMD ["/usr/local/bin/reactcoach-api"]
