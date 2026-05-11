const d1 = new Date("2023-10-09T22:00:00-03:00");
console.log("Input: 2023-10-09T22:00:00-03:00");
console.log("getUTCDate():", d1.getUTCDate()); 
console.log("getDate():", d1.getDate());

const d2 = new Date("2023-10-09");
console.log("\nInput: 2023-10-09");
console.log("getUTCDate():", d2.getUTCDate());
console.log("getDate():", d2.getDate());
