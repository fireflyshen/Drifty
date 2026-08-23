export type ParsedField = {
  action:'add'|'modify'|'change'|'drop';
  tableName:string;
  columnName:string;
  previousName?:string;
  dataType:string;
  nullable:boolean;
  defaultValue:string|null;
  comment:string;
  extra:string;
  ordinal:number;
  statementNo:number;
};

export type ParsedTable = { name:string; comment:string };
export type ParseResult = { fields:ParsedField[]; tables:ParsedTable[]; warnings:string[] };

function splitTopLevel(value:string, separator=',') {
  const parts:string[] = [];
  let current = '';
  let depth = 0;
  let quote = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];
    if (quote) {
      current += char;
      if (char === '\\' && next) { current += next; index += 1; continue; }
      if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; current += char; continue; }
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === separator && depth === 0) { if (current.trim()) parts.push(current.trim()); current = ''; continue; }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function splitStatements(sql:string) {
  const cleaned = sql.replace(/^\s*(?:--|#).*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ' ');
  return splitTopLevel(cleaned, ';').map((statement) => statement.trim()).filter(Boolean);
}

function unquote(value:string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
  }
  return trimmed;
}

function parseDefinition(definition:string, context:{tableName:string;action:ParsedField['action'];statementNo:number;ordinal:number;previousName?:string}) {
  const match = definition.trim().match(/^`?([A-Za-z0-9_$]+)`?\s+([A-Za-z]+(?:\s*\([^)]*\))?(?:\s+UNSIGNED)?(?:\s+ZEROFILL)?)([\s\S]*)$/i);
  if (!match) return null;
  const [, columnName, rawType, tail] = match;
  const defaultMatch = tail.match(/\bDEFAULT\s+((?:'(?:\\'|[^'])*')|(?:"(?:\\"|[^"])*")|[^\s,]+)/i);
  const commentMatch = tail.match(/\bCOMMENT\s+((?:'(?:\\'|[^'])*')|(?:"(?:\\"|[^"])*"))/i);
  const extra = [
    /\bAUTO_INCREMENT\b/i.test(tail) ? 'auto_increment' : '',
    /\bON\s+UPDATE\s+[^\s,]+/i.exec(tail)?.[0]?.toLowerCase() ?? '',
  ].filter(Boolean).join(' ');
  return {
    ...context,
    columnName,
    dataType:rawType.replace(/\s+/g, ' ').toLowerCase(),
    nullable:!/\bNOT\s+NULL\b/i.test(tail),
    defaultValue:defaultMatch ? unquote(defaultMatch[1]) : null,
    comment:commentMatch ? unquote(commentMatch[1]) : '',
    extra,
  } satisfies ParsedField;
}

export function parseMysqlSql(sql:string):ParseResult {
  const fields:ParsedField[] = [];
  const tables:ParsedTable[] = [];
  const warnings:string[] = [];
  const statements = splitStatements(sql);

  statements.forEach((statement, statementIndex) => {
    const statementNo = statementIndex + 1;
    const create = statement.match(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`?[A-Za-z0-9_$]+`?\.)?`?([A-Za-z0-9_$]+)`?\s*\(([\s\S]*)\)\s*([\s\S]*)$/i);
    if (create) {
      const tableName = create[1].toLowerCase();
      const tableComment = create[3].match(/\bCOMMENT\s*=\s*((?:'(?:\\'|[^'])*')|(?:"(?:\\"|[^"])*"))/i);
      tables.push({ name:tableName,comment:tableComment?unquote(tableComment[1]):'' });
      let ordinal = 0;
      splitTopLevel(create[2]).forEach((definition) => {
        if (/^(?:PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN|CHECK|FULLTEXT|SPATIAL)\b/i.test(definition)) return;
        ordinal += 1;
        const parsed = parseDefinition(definition, { tableName, action:'add', statementNo, ordinal });
        if (parsed) fields.push(parsed); else warnings.push(`第 ${statementNo} 条语句中有一行字段定义无法识别：${definition.slice(0,80)}`);
      });
      return;
    }

    const alter = statement.match(/\bALTER\s+TABLE\s+(?:`?[A-Za-z0-9_$]+`?\.)?`?([A-Za-z0-9_$]+)`?\s+([\s\S]+)$/i);
    if (alter) {
      const tableName = alter[1].toLowerCase();
      splitTopLevel(alter[2]).forEach((clause, clauseIndex) => {
        const add = clause.match(/^ADD\s+(?:COLUMN\s+)?([\s\S]+)$/i);
        const modify = clause.match(/^MODIFY\s+(?:COLUMN\s+)?([\s\S]+)$/i);
        const change = clause.match(/^CHANGE\s+(?:COLUMN\s+)?`?([A-Za-z0-9_$]+)`?\s+([\s\S]+)$/i);
        const drop = clause.match(/^DROP\s+(?:COLUMN\s+)?`?([A-Za-z0-9_$]+)`?/i);
        if (add) {
          const parsed = parseDefinition(add[1], { tableName, action:'add', statementNo, ordinal:clauseIndex + 1 });
          if (parsed) fields.push(parsed); else warnings.push(`第 ${statementNo} 条 ADD COLUMN 无法识别。`);
        } else if (modify) {
          const parsed = parseDefinition(modify[1], { tableName, action:'modify', statementNo, ordinal:clauseIndex + 1 });
          if (parsed) fields.push(parsed); else warnings.push(`第 ${statementNo} 条 MODIFY COLUMN 无法识别。`);
        } else if (change) {
          const parsed = parseDefinition(change[2], { tableName, action:'change', statementNo, ordinal:clauseIndex + 1, previousName:change[1] });
          if (parsed) fields.push(parsed); else warnings.push(`第 ${statementNo} 条 CHANGE COLUMN 无法识别。`);
        } else if (drop) {
          fields.push({ action:'drop', tableName, columnName:drop[1], dataType:'', nullable:true, defaultValue:null, comment:'', extra:'', ordinal:clauseIndex + 1, statementNo });
        } else {
          warnings.push(`第 ${statementNo} 条 ALTER 操作暂不支持：${clause.slice(0,80)}`);
        }
      });
      return;
    }

    warnings.push(`第 ${statementNo} 条语句不是受支持的 CREATE TABLE 或 ALTER TABLE。`);
  });

  return { fields, tables, warnings };
}

export function fieldFingerprint(field:Pick<ParsedField,'tableName'|'columnName'|'dataType'|'nullable'|'defaultValue'|'comment'|'extra'>) {
  return [field.tableName, field.columnName, field.dataType.toLowerCase(), field.nullable ? 'null' : 'not-null', field.defaultValue ?? '', field.comment.trim(), field.extra.trim()].join('|');
}
