const low = 'teragrip forte tab rec 650/4 nochx4 far';
console.log('A /650\\/4/:', /650\/4/.test(low));
console.log('B d+ sep d+:', /(\d+)\s*[-/]\s*(\d+)/.test(low));
console.log('C unit opt + sep:', /(\d+)\s*(?:mg|g|ug|mcg|iu|ui)?\s*[-/]\s*(\d+)/.test(low));
console.log('D exact re:', /(\d+(?:[.,]\d+)?)\s*(?:mg|g|ug|mcg|iu|ui)?\s*[-/]\s*(\d+(?:[.,]\d+)?)\s*(?:mg|g|ug|mcg|iu|ui|%)?/.test(low));
console.log('E no iu g:', /(\d+(?:[.,]\d+)?)\s*(?:mg|ug|mcg|ui)?\s*[-/]\s*(\d+(?:[.,]\d+)?)\s*(?:mg|ug|mcg|ui|%)?/.test(low));
console.log('F no m:/', /(\d+)\s*(?:mg|ug|mcg|ui|g)?\s*[-/]\s*(\d+(?:[.,]\d+)?)\s*(?:mg|ug|mcg|ui|g|%)?/.test(low));
console.log('G only d+ sep d+ optunit:', /(\d+)\s*[-/]\s*(\d+)\s*(?:mg|g|ug|mcg|iu|ui|%)?/.test(low));
console.log('H with [.,]:', /(\d+(?:[.,]\d+)?)\s*[-/]\s*(\d+(?:[.,]\d+)?)\s*(?:mg|g|ug|mcg|iu|ui|%)?/.test(low));