import assert from 'node:assert/strict';
import { publicVaultError } from '../api/applicant-vault.js';
const privateValue = 'synthetic-private-upstream-value';
for (const input of [null, undefined, new Error(privateValue), new Error(`Invalid ${privateValue}`), {code:'MEMORY_CONFLICT',message:privateValue,factId:privateValue,version:privateValue}, new Error(`sensitive-memory opt-in ${privateValue}`),new Error(`certain answer ${privateValue}`)]) {
  const result = publicVaultError(input);
  assert.equal(JSON.stringify(result).includes(privateValue),false);
  assert.ok([400,409,500].includes(result.status));
}
assert.equal(publicVaultError({code:'MEMORY_CONFLICT',version:3}).body.factVersion,3);
assert.equal(publicVaultError({code:'MEMORY_CONFLICT',version:'secret'}).body.factVersion,null);
assert.equal(publicVaultError(new Error('certain answer required')).body.code,'ANSWER_CLARIFICATION_REQUIRED');
console.log('Vault public errors: private exception data excluded; conflict and clarification controls preserved.');
