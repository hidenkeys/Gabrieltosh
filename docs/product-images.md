# Product image coverage

All 34 products in the Surulere seed menu have a local product image, used consistently by the counter, basket, menu library, selected-drink preview and topping selector. No external image request is needed during trading. Newly created products without a dedicated mapping receive a category photograph; failed image loads fall back to the Bing Chun mascot.

## Retrieved photographs

Public Bing Chun menus were inspected on 21 October 2026:

- https://bingchunsrilanka.lk/ — lemonade, lemon black/green tea, vanilla/chocolate/mixed ice cream.
- https://www.foodpanda.com.kh/en/restaurant/uyup/bing-chun-pursat — strawberry, blueberry, grape and cocoa smoothies; jasmine honey tea; strawberry mulberry tea.
- https://www.foodpanda.my/restaurant/gi0p/bing-chun-ice-cream-and-tea-plaza-merdeka — mulberry popping pearls juice and chocolate milkshake.

Individual image URLs, product codes and filenames are recorded in `product-image-sources.json`. The existing Nigeria website assets remain in use for products that already had images. Only imagery was imported; Surulere prices, quantities, names and availability remain controlled by the POS menu.

## Generated and adapted assets

The four smoothie source photographs contain promotional backgrounds and overseas price graphics. The built-in image generation tool isolated the recognisable cups, retained their flavour/branding and removed the poster decoration and prices to fit the existing card design.

Matching standalone Bing Chun topping photographs were not found in the inspected menus. Boba, coconut jelly, jelly and crystal pearls therefore use generated representative product photographs: individual clear glass bowls, consistent studio lighting and transparent backgrounds. These are illustrative assets, not verified photographs of the Surulere portions or recipes.

Every generation/edit prompt, its product code and final workspace asset path is recorded in `image-generation-prompts.json`. Built-in `image_gen` was used; no external paid stock account or CLI API key was used. Generated alpha transparency is retained when encoding the assets to WebP for the local application.
