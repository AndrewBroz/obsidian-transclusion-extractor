import { App, editorInfoField, Menu, Notice, setIcon } from "obsidian";
import { EditorView, PluginValue, ViewPlugin } from "@codemirror/view";
import { embedHitAt, inlineEmbed, isNoteEmbed } from "./inlineEmbed";
import { embedForWidget, EmbedRef } from "../transforms/embeds";

const EMBED_SELECTOR = ".internal-embed.markdown-embed";
const MENU_CLASS = "te-embed-menu";
const NOT_FOUND_NOTICE = "Can't find this transclusion in the note.";

class EmbedMenuButtonPlugin implements PluginValue {
  private observer: MutationObserver;
  private frame: number | null = null;

  constructor(
    private view: EditorView,
    private app: App,
  ) {
    this.observer = new MutationObserver(() => this.scheduleDecorate());
    this.observer.observe(view.contentDOM, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
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
        // A note embed rendered inside another embed's content (e.g. an embed that itself
        // transcludes something) must not get a button of its own — clicking it would end up
        // inlining the OUTER embed instead, since that's what the widget range resolves to.
        if (embedEl.parentElement?.closest(".markdown-embed")) continue;
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

    // Stop mousedown/pointerdown too, not just click: CodeMirror reacts to the press itself
    // (moving the cursor, revealing the embed's source) before a click event ever fires.
    const stop = (evt: Event) => {
      evt.preventDefault();
      evt.stopPropagation();
    };
    button.addEventListener("mousedown", stop);
    button.addEventListener("pointerdown", stop);
    button.addEventListener("click", (evt) => this.onClick(evt, embedEl));

    const expandLink = embedEl.querySelector(":scope > .markdown-embed-link");
    if (expandLink) expandLink.insertAdjacentElement("beforebegin", button);
    else embedEl.appendChild(button);
  }

  /** The widget's DOM range as `posAtDOM` reports it, or null if the node is detached. */
  private widgetRange(embedEl: HTMLElement): { from: number; to: number } | null {
    let from: number;
    try {
      from = this.view.posAtDOM(embedEl);
    } catch {
      return null;
    }
    let to: number;
    try {
      to = this.view.posAtDOM(embedEl, embedEl.childNodes.length);
    } catch {
      to = from;
    }
    if (to < from) to = from;
    return { from, to };
  }

  private resolveRef(embedEl: HTMLElement): EmbedRef | null {
    const range = this.widgetRange(embedEl);
    if (!range) return null;
    return embedForWidget(this.view.state.doc.toString(), range.from, range.to, embedEl.getAttribute("src"));
  }

  private onClick(evt: MouseEvent, embedEl: HTMLElement): void {
    evt.preventDefault();
    evt.stopPropagation();

    const info = this.view.state.field(editorInfoField, false);
    const editor = info?.editor;
    const file = info?.file;
    const ref = this.resolveRef(embedEl);
    if (!editor || !file || !ref) {
      new Notice(NOT_FOUND_NOTICE);
      return;
    }
    if (!isNoteEmbed(this.app, ref, file.path)) {
      new Notice("Only note embeds can be inlined.");
      return;
    }

    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle("Inline transclusion")
        .setIcon("unfold-vertical")
        .onClick(() => {
          // Recompute rather than reuse the ref captured at ⋯-click time: the document may
          // have changed between opening the menu and choosing this item.
          const freshRef = this.resolveRef(embedEl);
          if (!freshRef) {
            new Notice(NOT_FOUND_NOTICE);
            return;
          }
          void inlineEmbed(this.app, editor, file, embedHitAt(editor, freshRef));
        }),
    );
    menu.showAtMouseEvent(evt);
  }
}

export function embedMenuButtonExtension(app: App) {
  return ViewPlugin.define((view) => new EmbedMenuButtonPlugin(view, app));
}
