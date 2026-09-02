<script lang="ts">
  /**
   * Dev-only results page for `changes/selftest.ts`.
   *
   * Exists because there is nowhere else for frontend logic assertions to live
   * in this repo: no JS test runner, and `cargo test` cannot launch a harness
   * in the app crate. Reachable at `/selftest` under `npm run dev`.
   *
   * It ships in the bundle — it is a couple of kilobytes and a route nobody
   * navigates to, which is a much smaller cost than the assertions rotting
   * because running them needed a toolchain that was never added.
   */
  import { runChecks, type Check } from "$lib/changes/selftest";

  let checks = $state<Check[]>([]);
  let error = $state<string | null>(null);

  try {
    checks = runChecks();
  } catch (e) {
    error = String(e);
  }

  let failed = $derived(checks.filter((c) => !c.ok));
  let groups = $derived([...new Set(checks.map((c) => c.group))]);
</script>

<svelte:head><title>Fox MD — self-test</title></svelte:head>

<main>
  <h1>Changes — self-test</h1>

  {#if error}
    <p class="verdict bad">Threw before finishing: {error}</p>
  {:else}
    <p class="verdict" class:bad={failed.length > 0} class:good={failed.length === 0}>
      {checks.length - failed.length} / {checks.length} passing
      {#if failed.length > 0}· {failed.length} failing{/if}
    </p>
  {/if}

  {#each groups as group (group)}
    <section>
      <h2>{group}</h2>
      <table>
        <tbody>
          {#each checks.filter((c) => c.group === group) as c (c.group + c.label)}
            <tr class:bad={!c.ok}>
              <td class="mark">{c.ok ? "✓" : "✗"}</td>
              <td class="label">{c.label}</td>
              <td class="val">
                {#if c.ok}
                  <code>{JSON.stringify(c.got)}</code>
                {:else}
                  <code class="got">got {JSON.stringify(c.got)}</code>
                  <code class="want">want {JSON.stringify(c.want)}</code>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/each}
</main>

<style>
  main {
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem 1.5rem 5rem;
    font-family: ui-sans-serif, system-ui, sans-serif;
    color: #1b1b1b;
    background: #fff;
    min-height: 100vh;
  }
  h1 { font-size: 20px; margin: 0 0 .75rem; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .07em; color: #666; margin: 1.6rem 0 .4rem; }
  .verdict { font-size: 14px; font-weight: 600; padding: .5rem .75rem; border-radius: 6px; }
  .verdict.good { background: #e7f5ea; color: #1c6b33; }
  .verdict.bad { background: #fdeaea; color: #91231c; }
  table { width: 100%; border-collapse: collapse; }
  tr { border-bottom: 1px solid #eee; }
  tr.bad { background: #fdf3f3; }
  td { padding: .3rem .4rem; vertical-align: top; font-size: 12.5px; }
  .mark { width: 1.4em; color: #1c6b33; font-weight: 700; }
  tr.bad .mark { color: #91231c; }
  .label { width: 45%; }
  .val code { display: block; font-size: 11.5px; color: #555; font-family: ui-monospace, Consolas, monospace; }
  .val .got { color: #91231c; }
  .val .want { color: #1c6b33; }
</style>
