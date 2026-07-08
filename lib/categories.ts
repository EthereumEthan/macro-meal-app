// Groups recipe ingredients into grocery-store aisles so the shopping list
// is organized the way a store is. Uses longest-keyword-wins matching (like
// the nutrition lookup) so "coconut milk" beats "milk" and "tomato sauce"
// beats "tomato".

export const AISLE_ORDER = [
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Bakery & Grains",
  "Frozen",
  "Pantry & Canned",
  "Other",
] as const;

export type Aisle = (typeof AISLE_ORDER)[number];

const KEYWORDS: Record<Exclude<Aisle, "Other">, string[]> = {
  Produce: [
    "green onion", "spring onion", "scallion", "bell pepper", "red pepper",
    "chili pepper", "jalapeno", "jalapeño", "shallot", "leek", "onion",
    "garlic", "ginger", "tomato", "potato", "sweet potato", "carrot",
    "celery", "zucchini", "courgette", "cucumber", "broccoli", "spinach",
    "kale", "mushroom", "lettuce", "cabbage", "avocado", "lemon", "lime",
    "basil", "parsley", "cilantro", "coriander", "mint", "thyme", "rosemary",
    "herb", "corn", "pea", "apple", "banana", "berry", "squash", "eggplant",
    "aubergine", "sprout", "asparagus", "cauliflower", "green bean",
  ],
  "Meat & Seafood": [
    "chicken", "beef", "ground beef", "pork", "pork belly", "pork tenderloin",
    "turkey", "ground turkey", "bacon", "turkey bacon", "lamb", "salmon",
    "tuna", "cod", "white fish", "fish", "shrimp", "prawn", "sausage",
    "steak", "mince", "ham", "meat", "seafood", "chorizo",
  ],
  "Dairy & Eggs": [
    "milk", "skim milk", "heavy cream", "double cream", "sour cream",
    "cream cheese", "cream", "yogurt", "yoghurt", "greek yogurt", "cheese",
    "parmesan", "mozzarella", "cheddar", "feta", "provolone", "butter",
    "egg",
  ],
  "Bakery & Grains": [
    "bread", "bread crumbs", "breadcrumbs", "panko", "tortilla", "pasta",
    "noodle", "rice noodle", "rice", "brown rice", "flour", "quinoa", "oats",
    "bun", "roll", "bagel", "spaghetti", "penne", "linguine", "fettuccine",
    "macaroni", "lasagne", "lasagna", "couscous", "chickpea pasta",
  ],
  Frozen: ["frozen", "ice cream", "ice cube"],
  "Pantry & Canned": [
    "olive oil", "vegetable oil", "sesame oil", "coconut oil", "oil",
    "vinegar", "soy sauce", "fish sauce", "oyster sauce", "tomato sauce",
    "tomato paste", "tomato puree", "chopped tomatoes", "sauce", "stock",
    "broth", "sugar", "honey", "maple syrup", "syrup", "spice", "cumin",
    "paprika", "cinnamon", "chili powder", "curry", "black bean",
    "kidney bean", "chickpea", "lentil", "bean", "canned", "can of",
    "paste", "puree", "wine", "mayonnaise", "mustard", "ketchup",
    "peanut butter", "peanut", "almond", "cashew", "nut", "seed",
    "cornstarch", "cornflour", "baking powder", "baking soda", "vanilla",
    "cocoa", "coconut milk", "coconut", "water", "salt", "pepper",
  ],
};

// Flatten to [aisle, keyword] pairs once
const PAIRS: [Aisle, string][] = [];
for (const aisle of Object.keys(KEYWORDS) as Exclude<Aisle, "Other">[]) {
  for (const kw of KEYWORDS[aisle]) PAIRS.push([aisle, kw]);
}

export function categorize(ingredientText: string): Aisle {
  const lower = ingredientText.toLowerCase();
  let best: Aisle = "Other";
  let bestLen = 0;
  for (const [aisle, kw] of PAIRS) {
    if (lower.includes(kw) && kw.length > bestLen) {
      best = aisle;
      bestLen = kw.length;
    }
  }
  return best;
}
