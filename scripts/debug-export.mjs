#!/usr/bin/env node
import { ProviderTreeRoot } from '../packages/core/dist/src/config/providerTreeNodes.js';
import { JsonGraphCRUD } from '../packages/core/dist/src/config/tree/jsonGraphCRUD.js';

const tree = new ProviderTreeRoot();
await tree.initialize();

const crud = new JsonGraphCRUD(tree);

const result = crud.exportGraph();
console.log('Export result:', JSON.stringify(result, null, 2));
