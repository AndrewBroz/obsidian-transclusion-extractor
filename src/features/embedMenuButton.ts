import { App, editorInfoField, Menu, Notice, setIcon } from "obsidian";
import { EditorView, PluginValue, ViewPlugin } from "@codemirror/view";
import { embedHitAt, inlineEmbed, isNoteEmbed } from "./inlineEmbed";
import { embedForWidget } from "../transforms/embeds";

const EMBED_SELECTOR = ".internal-embed.markdown-embed";
const MENU_CLASS = "te-embed-menu";

class EmbedMenuButtonPlugin implements PluginValue {
  private observer: MutationObserver;
  private frame: number | null = null;

  constructor(
    private view: EditorView,
    private app: App,
  ) {
    this.observer = new MutationObserver(() => this.scheduleDecorate());
    this.observer.observe(view.contentDOM, { childList: true, subtree: true });
    this.decorate();
  }

  destroy(): void {
    this.observer.disconnect();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
  }

  private scheduleDecorate(): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.decorate();
    });
  }

  private decorate(): void {
    try {
      const embeds = this.view.dom.querySelectorAll<HTMLElement>(EMBED_SELECTOR);
      for (const embedEl of Array.from(embeds)) {
        if (embedEl.querySelector(`:scope > .${MENU_CLASS}`)) continue;
        this.addButton(embedEl);
      }
    } catch {
      // Never throw from the observer callback.
    }
  }

  private addButton(embedEl: HTMLElement): void {
    const button = createSpan({ cls: ["clickable-icon", MENU_CLASS] });
    button.setAttribute("aria-label", "Transclusion options");
    setIcon(button, "more-horizontal");
    button.addEventListener("click", (evt) => this.onClick(evt, embedEl));

    const expandLink = embedEl.querySelector(":scope > .markdown-embed-link");
    if (expandLink) expandLink.insertAdjacentElement("beforebegin", button);
    else embedEl.appendChild(button);
  }

  private onClick(evt: MouseEvent, embedEl: HTMLElement): void {
    evt.preventDefault();
    evt.stopPropagation();

    let pos: number;
    try {
      pos = this.view.posAtDOM(embedEl);
    } catch {
      new Notice("Can't find this transclusion in the note.");
      return;
    }

    const info = this.view.state.field(editorInfoField, false);
    const editor = info?.editor;
    const file = info?.file;
    const ref = embedForWidget(this.view.state.doc.toString(), pos, embedEl.getAttribute("src"));
    if (!editor || !file || !ref) {
      new Notice("Can't find this transclusion in the note.");
      return;
    }

    const menu = new Menu();
    if (isNoteEmbed(this.app, ref, file.path)) {
      menu.addItem((item) =>
        item
          .setTitle("Inline transclusion")
          .setIcon("unfold-vertical")
          .onClick(() => void inlineEmbed(this.app, editor, file, embedHitAt(editor, ref))),
      );
    }
    menu.showAtMouseEvent(evt);
  }
}

export function embedMenuButtonExtension(app: App) {
  return ViewPlugin.define((view) => new EmbedMenuButtonPlugin(view, app));
}
