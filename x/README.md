# x

Celebratix helper CLI, run with Bun. Aliased in `.zshrc` as `x`.

```
x <command>
```

Run `x` without arguments to list commands.

## Adding a command

Create `commands/<name>.ts` exporting a `description` string and a default `run(args): Promise<number>` (the exit code). The file name is the command name.
