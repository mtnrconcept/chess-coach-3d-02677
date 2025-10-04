import assert from 'node:assert/strict';

const ruleId = 'test-rule-id';

const sanitizeGeneratedCode = (value) => {
  const codeBlockMatch = value.match(/```(?:[a-zA-Z]+)?\n([\s\S]*?)```/);
  const trimmed = codeBlockMatch ? codeBlockMatch[1] : value;
  return trimmed.replace(/^export\s+default\s+/m, 'module.exports = ').trim();
};

const ensureRuleId = (source) => {
  if (source.includes(ruleId) || source.includes('helpers.ruleId')) {
    return source;
  }

  const idPropertyRegex = /(id\s*:\s*)(['"])(.*?)\2/;
  if (idPropertyRegex.test(source)) {
    return source.replace(idPropertyRegex, `$1'${ruleId}'`);
  }

  if (/const\s+rule\s*=\s*{/.test(source)) {
    return source.replace(
      /const\s+rule\s*=\s*{/,
      `const rule = {\n  id: '${ruleId}',`
    );
  }

  if (/module\.exports\s*=\s*{/.test(source)) {
    return source
      .replace(
        /module\.exports\s*=\s*{/,
        `const rule = {\n  id: '${ruleId}',`
      )
      .concat('\n\nmodule.exports = rule;');
  }

  const normalized = source.startsWith('module.exports')
    ? source.replace(/module\.exports\s*=\s*/, '')
    : source;

  return `const rule = ${normalized}\n\nrule.id = '${ruleId}';\nmodule.exports = rule;`;
};

const normalize = (raw) => {
  let sanitized = sanitizeGeneratedCode(raw);
  if (!/module\.exports\s*=/.test(sanitized)) {
    const directObject = sanitized.match(/^{[\s\S]*}$/);
    if (directObject) {
      sanitized = `const rule = ${sanitized}\n\nmodule.exports = rule;`;
    } else {
      throw new Error('unexpected format');
    }
  }

  sanitized = ensureRuleId(sanitized);

  if (!/module\.exports\s*=/.test(sanitized)) {
    sanitized += '\n\nmodule.exports = rule;';
  }

  return sanitized.trim();
};

// Test 1: markdown fenced code with export default
const generatedWithExportDefault = `Voici le code:\n\n\`\`\`ts\nexport default {\n  id: 'wrong',\n  name: 'Variant',\n};\n\`\`\``;
const normalized1 = normalize(generatedWithExportDefault);
assert.ok(normalized1.includes("module.exports ="), 'should convert export default');
assert.ok(normalized1.includes(`id: '${ruleId}'`), 'should enforce rule id');

// Test 2: direct object without export
const generatedDirectObject = `\`\`\`javascript\n{\n  name: 'Variant',\n}\n\`\`\``;
const normalized2 = normalize(generatedDirectObject);
assert.ok(normalized2.startsWith('const rule = {'));
assert.ok(normalized2.includes(`id: '${ruleId}'`));

// Test 3: module.exports already present but wrong id
const generatedModuleExports = `module.exports = {\n  id: 'bad',\n  name: 'Variant'\n};`;
const normalized3 = normalize(generatedModuleExports);
assert.ok(normalized3.includes(`id: '${ruleId}'`));
assert.ok(/module\.exports\s*=/.test(normalized3));

console.log('All normalization scenarios passed.');
