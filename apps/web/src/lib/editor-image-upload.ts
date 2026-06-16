import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { uploadImage } from "./image-upload";
import { ApiClientError } from "./api";

const placeholderKey = new PluginKey("imageUploadPlaceholder");

interface PlaceholderAction {
  add?: { id: object; pos: number };
  remove?: { id: object };
}

const placeholderPlugin = new Plugin({
  key: placeholderKey,
  state: {
    init: () => DecorationSet.empty,
    apply(tr, set) {
      set = set.map(tr.mapping, tr.doc);
      const action = tr.getMeta(placeholderKey) as PlaceholderAction | undefined;
      if (action?.add) {
        const el = document.createElement("span");
        el.className = "image-upload-placeholder";
        el.textContent = "上传中…";
        const deco = Decoration.widget(action.add.pos, el, { id: action.add.id });
        set = set.add(tr.doc, [deco]);
      } else if (action?.remove) {
        const id = action.remove.id;
        set = set.remove(set.find(undefined, undefined, (spec) => spec.id === id));
      }
      return set;
    },
  },
  props: {
    decorations(state) {
      return placeholderKey.getState(state);
    },
  },
});

function findPlaceholder(view: EditorView, id: object): number | null {
  const set = placeholderKey.getState(view.state) as DecorationSet | undefined;
  const found = set?.find(undefined, undefined, (spec) => spec.id === id);
  return found && found.length ? found[0].from : null;
}

async function startUpload(
  view: EditorView,
  file: File,
  pos: number,
  onError: (msg: string) => void,
): Promise<void> {
  const id = {};
  const tr = view.state.tr;
  if (!tr.selection.empty) tr.deleteSelection();
  tr.setMeta(placeholderKey, { add: { id, pos } });
  view.dispatch(tr);

  try {
    const url = await uploadImage(file);
    const at = findPlaceholder(view, id);
    if (at == null) return; // placeholder removed while uploading
    const node = view.state.schema.nodes.image.create({ src: url });
    view.dispatch(
      view.state.tr
        .replaceWith(at, at, node)
        .setMeta(placeholderKey, { remove: { id } }),
    );
  } catch (e) {
    view.dispatch(view.state.tr.setMeta(placeholderKey, { remove: { id } }));
    onError(e instanceof ApiClientError ? e.message : "图片上传失败");
  }
}

function imageFilesFrom(list: FileList | undefined | null): File[] {
  if (!list) return [];
  return Array.from(list).filter((f) => f.type.startsWith("image/"));
}

export interface ImageUploadOptions {
  onError: (msg: string) => void;
}

export const ImageUpload = Extension.create<ImageUploadOptions>({
  name: "imageUpload",
  addOptions() {
    return { onError: () => {} };
  },
  addProseMirrorPlugins() {
    const onError = this.options.onError;
    return [
      placeholderPlugin,
      new Plugin({
        props: {
          handlePaste(view, event) {
            const files = imageFilesFrom(event.clipboardData?.files);
            if (files.length === 0) return false;
            event.preventDefault();
            const pos = view.state.selection.from;
            files.forEach((file) => void startUpload(view, file, pos, onError));
            return true;
          },
          handleDrop(view, event) {
            const files = imageFilesFrom((event as DragEvent).dataTransfer?.files);
            if (files.length === 0) return false;
            event.preventDefault();
            const coords = view.posAtCoords({
              left: (event as DragEvent).clientX,
              top: (event as DragEvent).clientY,
            });
            const pos = coords?.pos ?? view.state.selection.from;
            files.forEach((file) => void startUpload(view, file, pos, onError));
            return true;
          },
        },
      }),
    ];
  },
});
