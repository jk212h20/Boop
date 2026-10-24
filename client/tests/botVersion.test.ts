import test from 'node:test';
import assert from 'node:assert/strict';
import { botIdentity, versionConfig } from '../src/bot/version';

test('standard and easier opponents are explicitly versioned',()=>{
 assert.equal(botIdentity(versionConfig()),'Bot v4, standard');
 assert.equal(botIdentity(versionConfig('easy')),'Bot v4, easy');
 assert.equal(botIdentity(versionConfig('master')),'Bot v4, master');
});
test('changing work or evaluation cannot masquerade as standard',()=>{
 assert.match(botIdentity({...versionConfig(),nodeBudget:29999}),/custom \(unrated\)/);
 assert.match(botIdentity({...versionConfig(),twoInRowCats:31}),/custom \(unrated\)/);
 assert.equal(botIdentity({...versionConfig(),timeBudgetMs:1}),'Bot v4, standard');
});
