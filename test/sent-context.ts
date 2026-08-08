/**
 * What a captured request's first message actually says.
 *
 * The envelope wraps that message's text in one content block so the block can
 * carry the cache breakpoint (spec 0010), so a test asking what an Entrant was
 * shown reads the text out of the block rather than off `content` directly.
 */
export interface CapturedTurn {
  role: string;
  content: string | { type: string; text: string }[];
}

export function firstMessageText(
  messages: readonly {
    content: string | readonly { text: string }[];
  }[]
): string {
  const [first] = messages;
  if (first === undefined) {
    throw new Error("the captured request carried no messages");
  }
  return typeof first.content === "string"
    ? first.content
    : first.content.map(({ text }) => text).join("");
}
