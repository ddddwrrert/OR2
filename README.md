# OR2

Organon with the `vns-parent` plugin. This is a separate tree from OR1.

`vns-parent` replaces parent selection and mutation. The search loop, the official evaluator, and the survival rule stay as Organon ships them. The score bar is still the best official merit. The next parent can be that program or an archived behavior. Do not set `DSH_EVOLVE_FLOOR`.

On another computer, install Node 22.19 or newer, Python 3.12, and Docker, then:

```bash
bash evolve-tasks/setup.sh
bash evolve-tasks/start-ahc008-formal.sh
```

Put `organon-credentials.yaml` in this directory, or pass `DEEPSEEK_API_KEY` to `setup.sh`. The example file is `organon-credentials.yaml.example`.
