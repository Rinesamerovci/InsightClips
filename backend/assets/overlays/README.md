Local overlay assets for Auto-B-Roll rendering.

The renderer resolves `OverlayDecision.asset_path` relative to this directory.

Current bundled assets:

- `business/marketing_graph.png`
- `business/startup_rocket.png`
- `finance/bitcoin_icon.png`
- `finance/money_stack.png`
- `technology/ai_chip.png`

Sprint 9 validation rules expect the asset paths above to exist exactly as listed.
Overlay selection now resolves against this inventory deterministically before render time.
