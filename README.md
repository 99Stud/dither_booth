# Dither Booth

A self-service photo booth that dithers each portrait and prints it on a thermal receipt, with a lottery ticket on the side. A Raspberry Pi runs everything, an Epson TM-T20III prints, and an iPad is the guest screen.

## Documentation

Everything lives in the docs site, `apps/docs`: the venue field guide, maintenance runbooks, the build guide, how each part works, and the reference.

On a booth, admin serves them at `https://<hostname>.local:3002/docs/` (sidebar → **Docs**, or Settings → **Docs**), offline. Locally:

```bash
bun install
bun run docs:dev     # http://localhost:4321/docs/
```

Or read the pages directly in [`apps/docs/src/content/docs/`](apps/docs/src/content/docs/):

- [Venue checklist](apps/docs/src/content/docs/venue/checklist.mdx) and [Wi-Fi at a venue](apps/docs/src/content/docs/venue/wifi.mdx)
- [Troubleshooting](apps/docs/src/content/docs/maintenance/troubleshooting.md)
- [Build a booth](apps/docs/src/content/docs/build/parts-and-assembly.mdx)
- [System overview](apps/docs/src/content/docs/architecture/overview.md)
- [Local setup](apps/docs/src/content/docs/development/local-setup.mdx)

## Quick start

On a booth Pi:

```bash
curl -fsSL https://github.com/99Stud/dither_booth/releases/latest/download/install.sh | sudo bash
sudo booth install
```

On a laptop:

```bash
bun install
bun run --filter @dither-booth/engine db:migrate
bun run --filter @dither-booth/engine cert:generate <LAN_IP>
bun run dev
```

## Checks

```bash
bun run format && bun run lint && bun run check-types && bun run test && bun run build
```

Every change that adds or changes behaviour updates the docs in the same pull request. See [Writing these docs](apps/docs/src/content/docs/development/documentation.md).
