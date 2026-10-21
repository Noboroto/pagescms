import { readFns } from "@/fields/registry";
import { deepMap } from "@/lib/schema";
import { parse } from "@/lib/serialization";

const serializedTypes = ["yaml-frontmatter", "json-frontmatter", "toml-frontmatter", "yaml", "json", "toml"];

/**
 * Parse a file's text into the object the entry form edits, applying each field's
 * `read` transform. Shared by the entries API and the editor's "Import" button so an
 * imported file lands in the form exactly as a saved one would.
 */
const parseEntryContent = (
  content: string,
  schema: Record<string, any> | undefined,
  config: Record<string, any>
) => {
  if (!serializedTypes.includes(schema?.format) || !schema?.fields?.length) {
    return { body: content };
  }

  try {
    let contentObject: Record<string, any> = parse(content, { format: schema.format, delimiters: schema.delimiters });

    // Lists at the root are wrapped like on the client, so deepMap sees one object field.
    const entryFields = schema.list
      ? [{ name: "listWrapper", type: "object", list: true, fields: schema.fields }]
      : schema.fields;
    if (schema.list) contentObject = { listWrapper: contentObject };

    contentObject = deepMap(contentObject, entryFields, (value, field) => {
      const type = field.type;
      if (typeof type === "string" && readFns[type]) return readFns[type](value, field, config);
      return value;
    });

    return schema.list ? contentObject.listWrapper : contentObject;
  } catch (error: any) {
    throw new Error(`Error parsing frontmatter: ${error.message}`);
  }
};

export { parseEntryContent };
