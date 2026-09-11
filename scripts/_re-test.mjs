import { esComboCobeca } from './lib/cobecaParser.mjs';

const low = 'teragrip forte tab rec 650/4 nochx4 far';
const re = /(\d+(?:[.,]\d+)?)\s*(?:mg|g|ug|mcg|iu|ui)\s*[-/]\s*(\d+(?:[.,]\d+)?)\s*(?:mg|g|ug|mcg|iu|ui|%)?/;
console.log('regex:', re.test(low));
console.log('(\\d+)(?=\\s*(?:mg|g|...))? ->', /(\d+)\s*[-/]\s*(\d+(?:[.,]\d+)?)\s*(?!\s*\d)/.test(low));