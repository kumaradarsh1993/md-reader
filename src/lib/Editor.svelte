<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { settings, effectiveDark } from "./settings-store.svelte";

  interface Props { source: string; onSave: () => void }
  let { source = $bindable(""), onSave }: Props = $props();

  let host: HTMLDivElement;
  let view: any = null;

  onMount(async () => {
    const [{ EditorView, keymap, lineNumbers, highlightActiveLine }, { EditorState }, { defaultKeymap, history, historyKeymap }, { markdown }, { oneDark }] = await Promise.all([
      import("@codemirror/view"),
      import("@codemirror/state"),
      import("@codemirror/commands"),
      import("@codemirror/lang-markdown"),
      import("@codemirror/theme-one-dark"),
    ]);

    const dark = effectiveDark(settings.s.theme);

    const updateListener = EditorView.updateListener.of((u) => {
      if (u.docChanged) {
        source = u.state.doc.toString();
      }
    });

    const saveKeymap = keymap.of([
      {
        key: "Mod-s",
        run: () => {
          onSave?.();
          return true;
        },
      },
    ]);

    const state = EditorState.create({
      doc: source,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        saveKeymap,
        markdown(),
        EditorView.lineWrapping,
        ...(dark ? [oneDark] : []),
        updateListener,
      ],
    });

    view = new EditorView({ state, parent: host });
  });

  onDestroy(() => {
    view?.destroy();
  });

  // Reflect external source changes (e.g., file reload) into the editor.
  $effect(() => {
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== source) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: source },
      });
    }
  });
</script>

<div class="editor-host" bind:this={host}></div>

<style>
  .editor-host {
    flex: 1 1 0;
    min-width: 0;
    overflow: auto;
    height: 100%;
  }
  .editor-host :global(.cm-editor) {
    height: 100%;
    font-size: 14px;
  }
  .editor-host :global(.cm-scroller) {
    font-family: ui-monospace, Menlo, Consolas, "Cascadia Mono", monospace;
  }
</style>
