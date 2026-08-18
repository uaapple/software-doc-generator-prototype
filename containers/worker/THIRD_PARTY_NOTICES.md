# Third-party notices

The TCSD Worker image installs `@deepseek-ai/dsh@0.1.0-rc.7` during image
build. DSH is licensed under the MIT License; its license text is retained in
this directory as `dsh-MIT.txt`.

The package stays pinned to its exact version. Do not replace it with `latest`
or invoke it through `npx` at container start. Review the compatibility process
in `docs/docker-desktop-production-deployment.md` before any upgrade.
