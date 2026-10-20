# Dither Booth CLI (`booth`)

A single static binary that provisions and manages a booth Pi: Bun, the repo, the SSD, the database, the certificate, the systemd services, the Wi-Fi fallback and the health checks.

```bash
curl -fsSL https://github.com/99Stud/dither_booth/releases/latest/download/install.sh | sudo bash
sudo booth install
booth doctor
```

Development:

```bash
bun run --filter @dither-booth/cli dev -- --help
bun run --filter @dither-booth/cli build   # arm64 + x64 into dist/
```

Documentation, in `apps/docs`:

- [booth CLI reference](../docs/src/content/docs/reference/cli.md)
- [Install the software](../docs/src/content/docs/build/install-software.mdx)
- [Network and Wi-Fi fallback](../docs/src/content/docs/architecture/network.md)
- [Releases](../docs/src/content/docs/development/releases.md)
