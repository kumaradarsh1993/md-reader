<script lang="ts">
  /**
   * Settings → Handover.
   *
   * Two states, and they are deliberately not the same shape. Signed out is one
   * button and one sentence explaining what signing in buys — a list of
   * settings you cannot use yet is noise. Signed in is the account, what this
   * machine is called on the phone, and what was last published, because once
   * it works the only question is "is it actually publishing?".
   *
   * That last question is why the panel reports a count and a time rather than
   * a green tick. "Synced ✓" is indistinguishable from "synced two days ago and
   * has been failing since", which is exactly the state a sync feature fails
   * in.
   */
  import Icon from "./Icon.svelte";
  import { account } from "./account.svelte";
  import { settings } from "./settings-store.svelte";

  let lastPushLabel = $derived.by(() => {
    if (!account.lastPushAt) return "not yet";
    const age = Date.now() - account.lastPushAt;
    if (age < 60_000) return "just now";
    if (age < 3_600_000) return `${Math.floor(age / 60_000)} min ago`;
    return `${Math.floor(age / 3_600_000)} h ago`;
  });
</script>

<fieldset class="handover-group">
  <legend>
    <span>Handover</span>
    {#if account.state.signed_in}
      <span class="value">{account.syncing ? "publishing…" : lastPushLabel}</span>
    {/if}
  </legend>

  {#if !account.state.signed_in}
    <p class="hint smart-hint">
      Sign in and Fox MD publishes the documents you have open, so they are
      waiting on your phone when you walk away from this machine. Nothing is
      published until you sign in, and only ever to your own account.
    </p>
    <div class="presets">
      <button type="button" onclick={() => account.signIn()} disabled={account.busy}>
        {account.busy ? "Waiting for your browser…" : "Sign in with Google"}
      </button>
    </div>
    {#if account.busy}
      <p class="hint">
        A browser tab has opened. Finish signing in there and come back — this
        window is waiting.
      </p>
    {/if}
  {:else}
    <div class="account-row">
      <span class="avatar">{(account.state.name ?? "?").slice(0, 1).toUpperCase()}</span>
      <div class="who">
        <strong>{account.state.name}</strong>
        {#if account.state.email}<small>{account.state.email}</small>{/if}
      </div>
      <button type="button" class="ghost" onclick={() => account.signOut()} disabled={account.busy}>
        Sign out
      </button>
    </div>

    <label class="check">
      <input
        type="checkbox"
        checked={settings.s.handoverEnabled}
        onchange={(e) => {
          settings.set("handoverEnabled", (e.currentTarget as HTMLInputElement).checked);
          if (settings.s.handoverEnabled) void account.pushNow();
        }}
      />
      <span>
        Publish what is open on this machine
        <small>(turn off to stay signed in without this computer appearing on your phone)</small>
      </span>
    </label>

    <label>
      <span>What to call this machine</span>
      <input
        type="text"
        class="text-input"
        placeholder="Home Alienware"
        value={settings.s.deviceLabel}
        oninput={(e) => settings.set("deviceLabel", (e.currentTarget as HTMLInputElement).value)}
        onchange={() => account.pushNow()}
      />
    </label>

    <div class="presets">
      <button type="button" onclick={() => account.pushNow()} disabled={account.syncing}>
        {account.syncing ? "Publishing…" : "Publish now"}
      </button>
      {#if account.lastPush}
        <span class="stat">
          {account.lastPush.pushed} document{account.lastPush.pushed === 1 ? "" : "s"}
          {#if account.lastPush.oversize > 0}
            · {account.lastPush.oversize} too large to carry
          {/if}
        </span>
      {/if}
    </div>

    {#if account.pushError}
      <p class="hint error">
        <Icon name="info" size={12} />
        {account.pushError}
      </p>
    {/if}
    {#if account.state.error}
      <p class="hint error">{account.state.error}</p>
    {/if}
  {/if}
</fieldset>

<style>
  .account-row {
    display: flex;
    align-items: center;
    gap: .6rem;
    padding: .1rem 0 .5rem;
  }
  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--bg);
    font-weight: 700;
    font-size: 13px;
    flex: none;
  }
  .who { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; }
  .who strong { font-size: 13px; }
  .who small { color: var(--muted-strong); font-size: 11.5px; }
  .ghost {
    background: none;
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--muted-strong);
    font: inherit;
    font-size: 11.5px;
    padding: .25rem .6rem;
    cursor: pointer;
  }
  .ghost:hover { background: var(--hover-bg); color: var(--fg-strong); }
  .stat { font-size: 11.5px; color: var(--muted-strong); align-self: center; }
  .hint.error { color: var(--danger, #c0392b); display: flex; gap: .3rem; align-items: flex-start; }
</style>
