# ── Build stage ──────────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache gcc musl-dev sqlite-dev

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-s -w" -o vanguard-server ./cmd/server/

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM alpine:3.19
RUN apk add --no-cache ca-certificates sqlite-libs wget

WORKDIR /app
COPY --from=builder /app/vanguard-server .

RUN mkdir -p /data
EXPOSE 8080

CMD ["./vanguard-server"]
