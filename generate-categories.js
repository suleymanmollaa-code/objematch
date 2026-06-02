const fs = require('fs');
const path = require('path');

const AFFILIATE = 'objematch-20';
const amz = (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}&tag=${AFFILIATE}`;
const ebay = (q) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`;

const categories = [
  {
    slug: 'living-room',
    name: 'Living Room',
    emoji: '🛋️',
    color: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
    h1: 'Living Room Essentials — Most Searched Products',
    desc: 'The most popular living room upgrades on Amazon. From area rugs and floor lamps to accent chairs and wall art — everything people search for to complete their living room.',
    metaDesc: 'Shop the most searched living room products on Amazon. Area rugs, floor lamps, accent chairs, wall art, coffee tables, curtains, and more.',
    items: [
      { name: 'Area Rug 8x10', desc: 'Anchors your furniture and makes the room feel designed. The single most impactful living room upgrade.', search: 'area rug 8x10 living room', ebaySearch: 'area rug 8x10', price: '$45–$180', emoji: '🟫' },
      { name: 'Floor Lamp', desc: 'Ambient lighting that replaces harsh overhead light. Arc lamps are particularly popular over sofas.', search: 'arc floor lamp living room modern', ebaySearch: 'floor lamp arc modern', price: '$35–$120', emoji: '💡' },
      { name: 'Accent Chair', desc: 'Creates a proper seating arrangement. Velvet or boucle accent chairs are trending.', search: 'accent chair living room velvet', ebaySearch: 'accent chair velvet living room', price: '$80–$350', emoji: '🪑' },
      { name: 'Wall Art Canvas', desc: 'Fills blank walls above the sofa. Large-format canvases or gallery sets work best.', search: 'large wall art canvas living room', ebaySearch: 'large canvas wall art', price: '$25–$150', emoji: '🖼️' },
      { name: 'Coffee Table', desc: 'The centerpiece of the seating area. Wood, marble-look, and glass are the most searched styles.', search: 'coffee table modern living room', ebaySearch: 'coffee table modern wood', price: '$60–$300', emoji: '🪵' },
      { name: 'Throw Pillows Set', desc: 'Add color and texture to a plain sofa. Sets of 4 with mixed sizes look best.', search: 'throw pillows for couch set of 4', ebaySearch: 'decorative throw pillows set', price: '$25–$70', emoji: '🛋️' },
      { name: 'Curtains Floor Length', desc: 'Hung near the ceiling to make windows look larger. Linen and velvet styles lead searches.', search: 'floor length linen curtains living room', ebaySearch: 'floor length curtains linen', price: '$30–$90', emoji: '🪟' },
      { name: 'TV Stand / Media Console', desc: 'Organizes your entertainment area. Floating wall-mount consoles and mid-century legs are trending.', search: 'TV stand media console modern', ebaySearch: 'TV console media stand', price: '$80–$400', emoji: '📺' },
      { name: 'Bookshelf', desc: 'Adds personality and fills vertical space. Styled shelves are a top Pinterest search.', search: 'bookshelf modern living room 5 shelf', ebaySearch: 'bookshelf modern 5 shelf', price: '$50–$200', emoji: '📚' },
      { name: 'Side Table', desc: 'Every seat needs a surface. Nesting side tables offer flexibility.', search: 'side table living room set of 2', ebaySearch: 'end table side table set 2', price: '$30–$120', emoji: '🪑' },
      { name: 'Decorative Mirror', desc: 'Makes small rooms look larger and reflects light. Arched and sunburst styles are the most popular.', search: 'large decorative wall mirror living room', ebaySearch: 'large decorative mirror arched', price: '$40–$200', emoji: '🪞' },
      { name: 'Indoor Plant', desc: 'Adds life and texture. Fiddle leaf, monstera, and snake plants lead living room searches.', search: 'large artificial fiddle leaf fig tree', ebaySearch: 'large faux plant indoor', price: '$25–$80', emoji: '🌿' },
    ],
    blogSlug: 'living-room-upgrade-guide',
    blogTitle: '10 Things Your Living Room Is Missing',
  },
  {
    slug: 'home-office',
    name: 'Home Office',
    emoji: '💻',
    color: 'linear-gradient(135deg,#059669,#0891b2)',
    h1: 'Home Office Essentials — Most Searched Products',
    desc: 'The most searched home office upgrades on Amazon. Ergonomic chairs, monitor arms, desk lamps, and everything you need to build a productive workspace.',
    metaDesc: 'Shop the most searched home office products. Ergonomic chairs, monitor arms, standing desks, desk lamps, webcams, and cable management.',
    items: [
      { name: 'Ergonomic Chair', desc: 'The most impactful purchase for anyone sitting 6+ hours daily. Lumbar support is the top searched feature.', search: 'ergonomic office chair lumbar support adjustable', ebaySearch: 'ergonomic office chair', price: '$120–$400', emoji: '🪑' },
      { name: 'Monitor Arm', desc: 'Raises your screen to eye level and frees up desk space. Dual monitor arms are trending.', search: 'monitor arm desk mount single adjustable', ebaySearch: 'monitor arm desk mount vesa', price: '$25–$90', emoji: '🖥️' },
      { name: 'Standing Desk', desc: 'Sit-stand desks reduce back pain and increase energy. Electric height adjustment is the most searched feature.', search: 'electric standing desk height adjustable', ebaySearch: 'electric standing desk height adjustable', price: '$180–$600', emoji: '🖥️' },
      { name: 'Desk Lamp LED', desc: 'Reduces eye strain during long sessions. Adjustable color temperature is the key feature to look for.', search: 'desk lamp LED color temperature adjustable', ebaySearch: 'desk lamp led adjustable', price: '$20–$60', emoji: '💡' },
      { name: 'Webcam 1080p', desc: 'Built-in laptop cameras look unprofessional. A dedicated webcam dramatically improves video call quality.', search: '1080p webcam home office desk', ebaySearch: 'logitech webcam 1080p', price: '$35–$120', emoji: '📷' },
      { name: 'Mechanical Keyboard', desc: 'Better feedback and typing feel than membrane keyboards. Compact TKL layouts save desk space.', search: 'mechanical keyboard compact wireless home office', ebaySearch: 'mechanical keyboard wireless compact', price: '$45–$150', emoji: '⌨️' },
      { name: 'Laptop Stand', desc: 'Raises laptop to eye level to pair with external keyboard. Aluminum adjustable stands are most popular.', search: 'laptop stand adjustable aluminum desk', ebaySearch: 'laptop stand adjustable aluminum', price: '$20–$50', emoji: '💻' },
      { name: 'Cable Management', desc: 'Eliminates desk clutter instantly. Under-desk trays and cable clips are the top-searched solutions.', search: 'cable management desk under tray organizer', ebaySearch: 'cable management desk organizer', price: '$12–$35', emoji: '🔌' },
      { name: 'Desk Mat', desc: 'Unifies the workspace and protects the desk surface. Large leather-look mats lead searches.', search: 'large desk mat leather look office', ebaySearch: 'desk mat large leather', price: '$15–$40', emoji: '🟫' },
      { name: 'Desk Organizer', desc: 'Keeps pens, notebooks, and small items accessible. Bamboo and metal mesh are the trending materials.', search: 'desk organizer bamboo office supplies', ebaySearch: 'desk organizer office supplies', price: '$15–$45', emoji: '📋' },
      { name: 'USB Hub', desc: 'Modern laptops have few ports. A USB-C hub with multiple ports solves the cable management problem.', search: 'USB-C hub multiport adapter 7 in 1', ebaySearch: 'usb-c hub multiport adapter', price: '$20–$55', emoji: '🔌' },
      { name: 'Headset / Headphones', desc: 'Noise cancellation for focused work and clear call audio. Over-ear wireless headsets top the charts.', search: 'noise cancelling headset wireless office calls', ebaySearch: 'noise cancelling headset wireless', price: '$50–$200', emoji: '🎧' },
    ],
    blogSlug: 'home-office-setup-guide',
    blogTitle: 'The Home Office Upgrade Checklist: 12 Items That Actually Matter',
  },
  {
    slug: 'car-interior',
    name: 'Car Interior',
    emoji: '🚗',
    color: 'linear-gradient(135deg,#b45309,#f59e0b)',
    h1: 'Car Interior Accessories — Most Searched Products',
    desc: 'The most popular car interior upgrades and accessories on Amazon. Phone mounts, seat covers, dash cams, organizers, and everything to upgrade your car without buying a new one.',
    metaDesc: 'Shop the most searched car interior accessories. Phone mounts, seat covers, dash cams, floor mats, trunk organizers, and more.',
    items: [
      { name: 'Wireless Phone Mount', desc: 'Charges and holds your phone simultaneously. Magnetic vent mounts are the most searched option.', search: 'wireless charging car phone mount magnetic', ebaySearch: 'wireless charging car mount', price: '$20–$50', emoji: '📱' },
      { name: 'Seat Covers', desc: 'Instantly transforms the interior. Leather-look universal-fit covers are the top seller.', search: 'leather seat covers universal car front rear', ebaySearch: 'car seat covers leather universal', price: '$35–$90', emoji: '🪑' },
      { name: 'Dash Cam', desc: 'Records everything for insurance protection. Front and rear 4K cameras are the most searched spec.', search: 'dash cam front rear 4K dual channel', ebaySearch: 'dash cam front rear 4k', price: '$40–$120', emoji: '📹' },
      { name: 'All-Weather Floor Mats', desc: 'Protect the original carpet from mud and spills. Custom-fit and universal options available.', search: 'all weather floor mats car universal', ebaySearch: 'all weather floor mats car', price: '$25–$80', emoji: '🟫' },
      { name: 'Trunk Organizer', desc: 'Stops groceries and gear from rolling around. Collapsible with multiple compartments is the top search.', search: 'car trunk organizer collapsible compartments', ebaySearch: 'car trunk organizer collapsible', price: '$20–$45', emoji: '📦' },
      { name: 'Car Air Freshener', desc: 'Vent clips and diffusers that smell premium. Essential oil diffusers and wood-disc designs are trending.', search: 'car air freshener vent clip premium essential oil', ebaySearch: 'car air freshener vent clip', price: '$8–$25', emoji: '🌿' },
      { name: 'Steering Wheel Cover', desc: 'Adds grip and warmth to a worn wheel. Leather and microfiber are the most searched materials.', search: 'leather steering wheel cover universal fit', ebaySearch: 'leather steering wheel cover', price: '$12–$30', emoji: '🎡' },
      { name: 'Backseat Organizer', desc: 'Attaches to headrests to store tablets, snacks, and chargers. Essential for long trips.', search: 'backseat car organizer headrest kids travel', ebaySearch: 'backseat organizer car kids', price: '$15–$40', emoji: '🎒' },
      { name: 'Car Vacuum', desc: 'Cordless handheld vacuums designed for car interiors. High suction and slim nozzle are the key features.', search: 'car vacuum cordless handheld powerful', ebaySearch: 'cordless car vacuum handheld', price: '$20–$60', emoji: '🧹' },
      { name: 'Sunshade', desc: 'Keeps the interior cool and protects the dashboard from UV damage. Accordion fold is the most popular style.', search: 'car sunshade windshield accordion fold', ebaySearch: 'car sunshade windshield', price: '$10–$25', emoji: '☀️' },
    ],
    blogSlug: 'car-interior-upgrades',
    blogTitle: 'Car Interior Upgrades That Look Expensive But Aren\'t',
  },
  {
    slug: 'bedroom',
    name: 'Bedroom',
    emoji: '🛏️',
    color: 'linear-gradient(135deg,#be185d,#ec4899)',
    h1: 'Bedroom Essentials — Most Searched Products',
    desc: 'The most searched bedroom products on Amazon. From bedding sets and blackout curtains to nightstands and mattress toppers — everything for a better sleep environment.',
    metaDesc: 'Shop the most searched bedroom products. Bedding sets, blackout curtains, nightstands, mattress toppers, bed frames, and more.',
    items: [
      { name: 'Blackout Curtains', desc: 'Blocks morning light for better sleep. Linen-look blackout panels are the most searched style.', search: 'blackout curtains bedroom linen look', ebaySearch: 'blackout curtains bedroom', price: '$25–$80', emoji: '🪟' },
      { name: 'Mattress Topper', desc: 'Transforms mattress comfort without buying a new one. Memory foam and cooling gel are the top searches.', search: 'mattress topper memory foam cooling queen', ebaySearch: 'mattress topper memory foam queen', price: '$40–$150', emoji: '🛏️' },
      { name: 'Bedside Lamp', desc: 'Warm ambient light for reading and winding down. Touch dimmable and USB-charging bases are trending.', search: 'bedside table lamp touch dimmer USB', ebaySearch: 'bedside lamp touch dimmer', price: '$20–$60', emoji: '💡' },
      { name: 'Nightstand', desc: 'Most bedrooms need a surface on each side. Floating wall-mount and minimalist styles lead searches.', search: 'nightstand modern set of 2 with drawer', ebaySearch: 'nightstand set 2 modern', price: '$60–$200', emoji: '🪵' },
      { name: 'Duvet Cover Set', desc: 'Refreshes the entire room. Washed linen and waffle-knit textures are the top trending styles.', search: 'duvet cover set queen linen washed', ebaySearch: 'duvet cover set queen linen', price: '$35–$120', emoji: '🛏️' },
      { name: 'Throw Blanket', desc: 'Adds texture and warmth to the bed. Chunky knit and waffle weave styles are most popular.', search: 'throw blanket chunky knit bedroom', ebaySearch: 'throw blanket chunky knit', price: '$20–$60', emoji: '🧶' },
      { name: 'Full-Length Mirror', desc: 'Essential for any bedroom. Leaning floor mirrors and arched styles dominate searches.', search: 'full length mirror leaning floor bedroom', ebaySearch: 'full length mirror floor leaning', price: '$40–$150', emoji: '🪞' },
      { name: 'Decorative Pillows', desc: 'Makes the bed look styled. Euro shams and bolster pillows are the most searched additions.', search: 'decorative bed pillows euro shams set', ebaySearch: 'decorative pillows bed euro shams', price: '$25–$80', emoji: '🛋️' },
      { name: 'White Noise Machine', desc: 'Blocks disruptive sounds for better sleep. Fan sounds and brown noise are most used settings.', search: 'white noise machine sleep fan sound', ebaySearch: 'white noise machine sleep', price: '$20–$50', emoji: '🔊' },
      { name: 'Under-Bed Storage', desc: 'Uses the most wasted space in a bedroom. Rolling bins with lids for seasonal items.', search: 'under bed storage bins rolling with lids', ebaySearch: 'under bed storage rolling bins', price: '$25–$60', emoji: '📦' },
    ],
    blogSlug: 'bedroom-upgrade-guide',
    blogTitle: 'Why Your Bedroom Doesn\'t Feel Relaxing (And How to Fix It)',
  },
  {
    slug: 'gaming-setup',
    name: 'Gaming Setup',
    emoji: '🎮',
    color: 'linear-gradient(135deg,#6d28d9,#4f46e5)',
    h1: 'Gaming Setup Essentials — Most Searched Products',
    desc: 'The most searched gaming setup products on Amazon. Gaming chairs, monitors, mechanical keyboards, headsets, LED strips, and everything for a clean, high-performance desk setup.',
    metaDesc: 'Shop the most searched gaming setup products. Gaming chairs, monitors, mechanical keyboards, headsets, LED strips, monitor arms, and more.',
    items: [
      { name: 'Gaming Chair', desc: 'Ergonomic support for long sessions. Racing-style and hybrid gaming/office chairs are the top categories.', search: 'gaming chair ergonomic lumbar support', ebaySearch: 'gaming chair ergonomic', price: '$100–$400', emoji: '🪑' },
      { name: 'Gaming Monitor', desc: '144Hz and 1ms response time are the most searched specs. 27" 1440p is the current sweet spot.', search: 'gaming monitor 27 inch 144hz 1440p', ebaySearch: 'gaming monitor 27 144hz 1440p', price: '$200–$500', emoji: '🖥️' },
      { name: 'Mechanical Keyboard', desc: 'Better feedback and faster response than membrane. TKL and 75% layouts save desk space.', search: 'mechanical keyboard gaming TKL RGB', ebaySearch: 'mechanical keyboard gaming RGB TKL', price: '$50–$180', emoji: '⌨️' },
      { name: 'Gaming Mouse', desc: 'High DPI and lightweight design are the most searched features. Wireless is now mainstream.', search: 'gaming mouse wireless lightweight high DPI', ebaySearch: 'gaming mouse wireless lightweight', price: '$30–$120', emoji: '🖱️' },
      { name: 'Headset', desc: 'Surround sound and noise-cancelling mic lead searches. Wireless over-ear is the top category.', search: 'gaming headset wireless 7.1 surround sound', ebaySearch: 'gaming headset wireless surround', price: '$50–$200', emoji: '🎧' },
      { name: 'Monitor Arm', desc: 'Frees up desk space and allows perfect positioning. Dual arms for multi-monitor setups are popular.', search: 'monitor arm gaming dual single desk mount', ebaySearch: 'monitor arm gaming desk mount', price: '$25–$90', emoji: '🖥️' },
      { name: 'LED Strip Lights', desc: 'Adds RGB ambiance behind the desk and monitor. App-controlled and music-sync features are most searched.', search: 'LED strip lights gaming setup RGB app control', ebaySearch: 'LED strip lights RGB gaming', price: '$15–$40', emoji: '💡' },
      { name: 'Mousepad XL', desc: 'Extended desk mats that cover the whole surface. Low-friction surface for high-DPI play.', search: 'gaming mousepad XL extended desk mat', ebaySearch: 'gaming mousepad XL extended', price: '$15–$40', emoji: '🟫' },
      { name: 'Cable Sleeve', desc: 'Organizes and hides cables for a clean look. Split loom and braided sleeves are most popular.', search: 'cable sleeve gaming setup management wire', ebaySearch: 'cable sleeve wire management', price: '$10–$25', emoji: '🔌' },
      { name: 'Capture Card', desc: 'Required for streaming console gameplay to PC. Elgato dominates this search category.', search: 'capture card streaming 4K HDMI Elgato', ebaySearch: 'capture card HDMI 4K streaming', price: '$80–$200', emoji: '📹' },
    ],
    blogSlug: 'gaming-setup-guide',
    blogTitle: 'Gaming Setup Essentials: What Every Desk Is Missing',
  },
  {
    slug: 'garage',
    name: 'Garage',
    emoji: '🔧',
    color: 'linear-gradient(135deg,#065f46,#059669)',
    h1: 'Garage Organization & Workshop Essentials',
    desc: 'The most searched garage organization and workshop products. Wall storage systems, tool cabinets, overhead storage, shelving, and everything to turn a cluttered garage into a functional space.',
    metaDesc: 'Shop the most searched garage organization products. Wall systems, tool cabinets, overhead storage, workbenches, shelving units, and more.',
    items: [
      { name: 'Wall Storage System', desc: 'Slatwall panels and pegboard systems maximize wall space. The most impactful single garage upgrade.', search: 'garage wall storage system slatwall panels', ebaySearch: 'garage wall storage slatwall', price: '$80–$300', emoji: '🔧' },
      { name: 'Tool Cabinet', desc: 'Rolling tool chests with ball-bearing drawers. 5-drawer to 11-drawer setups are most searched.', search: 'tool cabinet rolling chest 5 drawer garage', ebaySearch: 'tool cabinet rolling chest', price: '$100–$500', emoji: '🧰' },
      { name: 'Overhead Storage Rack', desc: 'Uses the ceiling to store seasonal items. Weight-rated ceiling-mounted platforms are the top search.', search: 'overhead garage storage rack ceiling mount', ebaySearch: 'overhead garage storage rack ceiling', price: '$80–$200', emoji: '📦' },
      { name: 'Heavy-Duty Shelving', desc: 'Steel wire or solid shelf units rated for hundreds of pounds. Freestanding 5-tier is the most popular.', search: 'heavy duty garage shelving 5 tier steel', ebaySearch: 'heavy duty garage shelving steel', price: '$60–$200', emoji: '📚' },
      { name: 'Workbench', desc: 'Solid work surface for repairs and projects. Foldable wall-mount workbenches save space.', search: 'workbench garage fold-down wall mount', ebaySearch: 'workbench garage fold down', price: '$100–$400', emoji: '🪵' },
      { name: 'Pegboard Kit', desc: 'Classic tool organization for hand tools. Includes hooks, bins, and shelf attachments.', search: 'pegboard kit garage tool organizer hooks', ebaySearch: 'pegboard kit garage hooks', price: '$30–$80', emoji: '🔨' },
      { name: 'Bike Wall Mount', desc: 'Stores bikes vertically to free up floor space. Horizontal wheel hooks are the most searched type.', search: 'bike wall mount storage hook garage', ebaySearch: 'bike wall mount storage garage', price: '$15–$50', emoji: '🚲' },
      { name: 'Floor Epoxy Paint', desc: 'Transforms a bare concrete floor. Water-based epoxy kits with chip flakes are the most popular.', search: 'garage floor epoxy paint kit coating', ebaySearch: 'garage floor epoxy paint kit', price: '$40–$120', emoji: '🎨' },
      { name: 'Tool Organizer Set', desc: 'Wrench rolls, screwdriver holders, and bit organizers. Modular sets are the top search.', search: 'tool organizer set screwdriver wrench holder', ebaySearch: 'tool organizer set wrench', price: '$20–$60', emoji: '🔩' },
      { name: 'Utility Hooks', desc: 'Heavy-duty hooks for ladders, hoses, and power tools. Coated steel with 100lb+ ratings lead searches.', search: 'utility hooks heavy duty garage wall storage', ebaySearch: 'utility hooks heavy duty garage', price: '$15–$40', emoji: '🪝' },
    ],
    blogSlug: 'garage-organization-guide',
    blogTitle: 'Garage Organization: Turn Chaos Into a Functional Workshop',
  },
  {
    slug: 'kitchen',
    name: 'Kitchen',
    emoji: '🍳',
    color: 'linear-gradient(135deg,#dc2626,#ea580c)',
    h1: 'Kitchen Essentials — Most Searched Products',
    desc: 'The most popular kitchen upgrades and accessories on Amazon. Knife blocks, pot racks, coffee makers, air fryers, and everything to make your kitchen more functional and organized.',
    metaDesc: 'Shop the most searched kitchen products. Knife blocks, pot racks, coffee makers, air fryers, spice racks, cutting boards, and more.',
    items: [
      { name: 'Air Fryer', desc: 'The most searched kitchen appliance for years. Basket and oven-style are the two main categories.', search: 'air fryer large capacity basket 6 quart', ebaySearch: 'air fryer large capacity', price: '$40–$120', emoji: '🍟' },
      { name: 'Coffee Maker', desc: 'Drip machines, espresso makers, and pour-over setups. Programmable and built-in grinder are top features.', search: 'coffee maker programmable drip 12 cup', ebaySearch: 'coffee maker programmable 12 cup', price: '$30–$200', emoji: '☕' },
      { name: 'Knife Block Set', desc: 'A full knife set with a storage block. 15-piece sets with a built-in sharpener lead searches.', search: 'knife block set 15 piece kitchen sharpener', ebaySearch: 'knife block set kitchen 15 piece', price: '$40–$150', emoji: '🔪' },
      { name: 'Spice Rack Organizer', desc: 'Countertop, drawer, and wall-mount options. Tiered countertop racks are the most searched type.', search: 'spice rack organizer countertop tiered kitchen', ebaySearch: 'spice rack organizer countertop', price: '$15–$45', emoji: '🫙' },
      { name: 'Cutting Board Set', desc: 'Bamboo and plastic sets with juice grooves. Sets of 3 with different sizes are most popular.', search: 'cutting board set bamboo kitchen large', ebaySearch: 'cutting board bamboo set kitchen', price: '$20–$50', emoji: '🟫' },
      { name: 'Pot Rack', desc: 'Hanging ceiling or wall-mount pot storage. Frees up cabinet space and looks great.', search: 'pot rack hanging ceiling mount kitchen', ebaySearch: 'pot rack hanging ceiling kitchen', price: '$60–$200', emoji: '🍳' },
      { name: 'Dish Drying Rack', desc: 'Over-the-sink and collapsible designs are most popular. Stainless steel with draining board leads.', search: 'dish drying rack over sink stainless steel', ebaySearch: 'dish drying rack over sink', price: '$25–$70', emoji: '🍽️' },
      { name: 'Food Storage Containers', desc: 'Airtight glass and BPA-free plastic sets. 18-piece sets with matching lids are the top search.', search: 'food storage containers airtight glass set', ebaySearch: 'food storage containers glass airtight set', price: '$25–$70', emoji: '📦' },
      { name: 'Under-Sink Organizer', desc: 'Two-tier pull-out drawers maximize cabinet space. The most searched kitchen cabinet organizer.', search: 'under sink organizer kitchen cabinet pull out', ebaySearch: 'under sink organizer kitchen', price: '$20–$50', emoji: '🚿' },
      { name: 'Instant Pot', desc: 'Multi-function pressure cooker. 6-quart Duo is the most purchased model year after year.', search: 'Instant Pot Duo 6 quart pressure cooker', ebaySearch: 'instant pot duo 6 quart', price: '$60–$120', emoji: '🫕' },
    ],
    blogSlug: null,
    blogTitle: null,
  },
  {
    slug: 'bathroom',
    name: 'Bathroom',
    emoji: '🛁',
    color: 'linear-gradient(135deg,#0284c7,#0ea5e9)',
    h1: 'Bathroom Essentials — Most Searched Products',
    desc: 'The most searched bathroom accessories and upgrades on Amazon. Shower caddies, towel racks, mirrors, storage organizers, and everything to make your bathroom more functional.',
    metaDesc: 'Shop the most searched bathroom accessories. Shower caddies, towel racks, bath mats, mirrors, over-toilet storage, and more.',
    items: [
      { name: 'Shower Caddy', desc: 'Tension pole or wall-mount options. Rust-proof stainless steel with adjustable shelves leads searches.', search: 'shower caddy tension pole rust proof stainless', ebaySearch: 'shower caddy tension pole', price: '$20–$60', emoji: '🚿' },
      { name: 'Towel Rack', desc: 'Wall-mounted heated or standard bars. Over-door towel racks require no drilling.', search: 'towel rack wall mount bathroom brushed nickel', ebaySearch: 'towel rack wall mount bathroom', price: '$15–$60', emoji: '🪣' },
      { name: 'Bath Mat', desc: 'Non-slip mats with quick-dry memory foam. Sets with toilet mat included are most popular.', search: 'bath mat non slip memory foam set', ebaySearch: 'bath mat memory foam non slip', price: '$15–$50', emoji: '🟫' },
      { name: 'Bathroom Mirror', desc: 'LED-backlit mirrors with anti-fog are the top luxury upgrade. Arched and oval shapes are trending.', search: 'bathroom mirror LED backlit anti-fog wall mount', ebaySearch: 'bathroom mirror LED backlit', price: '$60–$250', emoji: '🪞' },
      { name: 'Over-Toilet Storage', desc: 'Freestanding shelving above the toilet maximizes a small bathroom. 3-tier units are most searched.', search: 'over toilet storage shelf 3 tier bathroom', ebaySearch: 'over toilet storage shelf', price: '$30–$80', emoji: '📚' },
      { name: 'Toilet Paper Holder', desc: 'Wall-mount with reserve holder below. Matte black and brushed gold finishes are trending.', search: 'toilet paper holder with reserve matte black', ebaySearch: 'toilet paper holder reserve matte black', price: '$15–$40', emoji: '🧻' },
      { name: 'Soap Dispenser Set', desc: 'Matching dispensers for soap and lotion. Ceramic, marble-look, and matte finishes are popular.', search: 'soap dispenser set bathroom countertop ceramic', ebaySearch: 'soap dispenser set bathroom', price: '$15–$40', emoji: '🫧' },
      { name: 'Shower Head', desc: 'High-pressure and rain-style are the most searched upgrades. Handheld combos are a top seller.', search: 'shower head high pressure rain handheld combo', ebaySearch: 'shower head high pressure rain', price: '$25–$90', emoji: '🚿' },
      { name: 'Medicine Cabinet', desc: 'Recessed and surface-mount options with mirror door. LED-lit interior is the top searched feature.', search: 'medicine cabinet with mirror LED bathroom', ebaySearch: 'medicine cabinet mirror LED', price: '$80–$250', emoji: '🪞' },
      { name: 'Toilet Brush Set', desc: 'Silicone brushes with drip-free holders are replacing traditional bristle brushes.', search: 'toilet brush silicone set bathroom holder', ebaySearch: 'toilet brush silicone set', price: '$12–$30', emoji: '🪣' },
    ],
    blogSlug: null,
    blogTitle: null,
  },
  {
    slug: 'closet',
    name: 'Closet',
    emoji: '👗',
    color: 'linear-gradient(135deg,#7c3aed,#a855f7)',
    h1: 'Closet Organization — Most Searched Products',
    desc: 'The most searched closet organizers and storage solutions on Amazon. Clothing racks, shoe racks, shelf dividers, drawer organizers, and everything to maximize your wardrobe space.',
    metaDesc: 'Shop the most searched closet organizers. Clothing racks, shoe racks, shelf dividers, velvet hangers, drawer organizers, and storage boxes.',
    items: [
      { name: 'Velvet Hangers', desc: 'Non-slip thin hangers double closet capacity. Sets of 50 or 100 are the most searched quantity.', search: 'velvet hangers non slip thin set 50', ebaySearch: 'velvet hangers non slip set', price: '$10–$25', emoji: '👔' },
      { name: 'Shoe Rack', desc: 'Tiered or stackable shoe organizers. 4-6 tier metal shoe racks are the most searched.', search: 'shoe rack 4 tier metal organizer closet', ebaySearch: 'shoe rack 4 tier metal', price: '$20–$60', emoji: '👟' },
      { name: 'Clothing Rack', desc: 'Freestanding garment racks for extra hanging space. Adjustable height and double-rod designs lead.', search: 'clothing rack freestanding double rod adjustable', ebaySearch: 'clothing rack freestanding double rod', price: '$30–$80', emoji: '👗' },
      { name: 'Shelf Dividers', desc: 'Prevent stacks from toppling in open shelving. Expandable steel versions fit most shelves.', search: 'shelf dividers closet expandable set', ebaySearch: 'shelf dividers closet expandable', price: '$12–$25', emoji: '📚' },
      { name: 'Drawer Organizer', desc: 'Divides drawers into sections for shirts, underwear, socks. Expandable bamboo and plastic are popular.', search: 'drawer organizer expandable closet dresser', ebaySearch: 'drawer organizer expandable', price: '$15–$35', emoji: '🗂️' },
      { name: 'Storage Boxes', desc: 'Fabric collapsible bins for shelves and under-bed. Sets of 6 with labels are most searched.', search: 'storage boxes fabric collapsible bins set 6', ebaySearch: 'storage bins fabric collapsible set', price: '$20–$50', emoji: '📦' },
      { name: 'Over-Door Organizer', desc: 'Hooks and pockets behind closet doors. Shoe pockets and accessory organizers are top types.', search: 'over door organizer shoe pockets closet', ebaySearch: 'over door organizer shoe pocket', price: '$15–$35', emoji: '🪝' },
      { name: 'Vacuum Storage Bags', desc: 'Compress seasonal clothing to a fraction of the space. XL sizes for comforters are most searched.', search: 'vacuum storage bags for clothes XL space saver', ebaySearch: 'vacuum storage bags clothes XL', price: '$12–$30', emoji: '🛍️' },
      { name: 'Belt & Tie Organizer', desc: 'Wall hooks or pull-out rack organizers. Motorized rotating belt racks are a top luxury search.', search: 'belt tie organizer closet rack holder', ebaySearch: 'belt tie organizer rack', price: '$10–$40', emoji: '👔' },
      { name: 'Closet Rod Extender', desc: 'Doubles hanging space by adding a second rod below. Works in any closet with existing rod.', search: 'closet rod extender double hanging space', ebaySearch: 'closet rod extender double hanging', price: '$15–$35', emoji: '📏' },
    ],
    blogSlug: null,
    blogTitle: null,
  },
  {
    slug: 'outdoor-patio',
    name: 'Outdoor / Patio',
    emoji: '🌿',
    color: 'linear-gradient(135deg,#15803d,#16a34a)',
    h1: 'Outdoor & Patio Essentials — Most Searched Products',
    desc: 'The most searched outdoor furniture and patio accessories on Amazon. Patio sets, string lights, outdoor rugs, fire pits, and everything to create a comfortable outdoor living space.',
    metaDesc: 'Shop the most searched patio and outdoor products. Patio furniture sets, string lights, outdoor rugs, fire pits, planters, and more.',
    items: [
      { name: 'Patio Furniture Set', desc: 'Sectional and bistro sets are the most searched. All-weather wicker and aluminum frames lead.', search: 'patio furniture set outdoor sectional wicker', ebaySearch: 'patio furniture set wicker sectional', price: '$200–$800', emoji: '🪑' },
      { name: 'String Lights', desc: 'Edison bulb globe lights on commercial-grade wire. Top-searched outdoor ambiance upgrade.', search: 'outdoor string lights Edison bulb globe patio', ebaySearch: 'outdoor string lights Edison patio', price: '$20–$60', emoji: '💡' },
      { name: 'Outdoor Rug', desc: 'Defines the seating area and adds color. UV and water-resistant materials are essential.', search: 'outdoor rug 8x10 water resistant patio', ebaySearch: 'outdoor rug 8x10 UV resistant', price: '$40–$150', emoji: '🟫' },
      { name: 'Fire Pit', desc: 'Propane and wood-burning pits are both popular. Smokeless wood-burning pits are a top trend.', search: 'fire pit propane outdoor patio smokeless', ebaySearch: 'fire pit propane outdoor patio', price: '$60–$300', emoji: '🔥' },
      { name: 'Patio Umbrella', desc: 'Cantilever and center-pole designs. Fade-resistant fabric and crank mechanism are key features.', search: 'patio umbrella cantilever outdoor 9ft', ebaySearch: 'patio umbrella cantilever 9ft', price: '$60–$200', emoji: '☂️' },
      { name: 'Outdoor Planters', desc: 'Large raised bed planters and decorative pots. Lightweight fiberglass and ceramic look are popular.', search: 'outdoor planters large decorative fiberglass', ebaySearch: 'outdoor planters large decorative', price: '$25–$120', emoji: '🪴' },
      { name: 'Hammock', desc: 'Rope and spreader bar hammocks with stands. Brazilian and Nicaraguan rope styles lead.', search: 'hammock with stand outdoor patio rope', ebaySearch: 'hammock with stand outdoor', price: '$40–$150', emoji: '🛏️' },
      { name: 'Outdoor Cushions', desc: 'Weather-resistant cushions for patio furniture. Solid colors and stripes in Sunbrella fabric are most searched.', search: 'outdoor cushions patio furniture set weather resistant', ebaySearch: 'outdoor cushions patio set', price: '$40–$150', emoji: '🛋️' },
      { name: 'Solar Garden Lights', desc: 'Path and stake lights that charge automatically. Warm white and color-changing are the two most searched options.', search: 'solar garden lights outdoor pathway stake', ebaySearch: 'solar garden lights pathway outdoor', price: '$15–$50', emoji: '🌟' },
      { name: 'Outdoor Side Table', desc: 'Weather-resistant side tables for drinks and phones. Folding and nesting designs maximize space.', search: 'outdoor side table weather resistant folding patio', ebaySearch: 'outdoor side table weather resistant', price: '$20–$80', emoji: '🪵' },
    ],
    blogSlug: null,
    blogTitle: null,
  },
];

function buildPage(cat) {
  const relatedCats = categories.filter(c => c.slug !== cat.slug).slice(0, 4);

  const itemCards = cat.items.map((item, i) => `
    <div class="item-card">
      <div class="item-emoji">${item.emoji}</div>
      <div class="item-body">
        <div class="item-name">${item.name}</div>
        <div class="item-desc">${item.desc}</div>
        <div class="item-price">${item.price}</div>
        <div class="item-links">
          <a href="${amz(item.search)}" target="_blank" rel="noopener" class="item-link lk-amz">
            <span>🛒</span> Buy New · Amazon
          </a>
          <a href="${ebay(item.ebaySearch)}" target="_blank" rel="noopener" class="item-link lk-ebay">
            <span>♻️</span> Buy Used · eBay
          </a>
        </div>
      </div>
    </div>`).join('');

  const relatedCards = relatedCats.map(c => `
    <a href="/category/${c.slug}.html" class="related-card">
      <span class="related-emoji">${c.emoji}</span>
      <span class="related-name">${c.name}</span>
    </a>`).join('');

  const blogSection = cat.blogSlug ? `
    <div class="blog-link">
      <div class="blog-link-label">Related Guide</div>
      <a href="/blog/${cat.blogSlug}.html" class="blog-link-card">
        <div>
          <div class="blog-link-title">${cat.blogTitle}</div>
          <div class="blog-link-sub">Read the full guide →</div>
        </div>
        <div class="blog-link-arrow">→</div>
      </a>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${cat.h1} | ObjeMatch</title>
  <meta name="description" content="${cat.metaDesc}">
  <link rel="canonical" href="https://www.objematch.com/category/${cat.slug}.html">
  <meta property="og:title" content="${cat.h1} | ObjeMatch">
  <meta property="og:description" content="${cat.metaDesc}">
  <meta property="og:url" content="https://www.objematch.com/category/${cat.slug}.html">
  <meta property="og:type" content="website">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "${cat.h1}",
    "description": "${cat.metaDesc}",
    "numberOfItems": ${cat.items.length},
    "itemListElement": [${cat.items.map((item, i) => `
      {"@type":"ListItem","position":${i+1},"name":"${item.name}","url":"${amz(item.search)}"}`).join(',')}
    ]
  }
  </script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; background: #f9fafb; color: #111827; }
    a { color: inherit; text-decoration: none; }
    nav { background: rgba(255,255,255,0.95); backdrop-filter: blur(12px); border-bottom: 1px solid #e5e7eb; padding: 0 clamp(16px,4vw,32px); height: 64px; display: flex; align-items: center; gap: 12px; position: sticky; top: 0; z-index: 100; }
    .logo { font-size: 20px; font-weight: 800; }
    .logo span { color: #f97316; }
    .nav-links { display: flex; gap: 4px; margin-left: auto; }
    .nav-link { font-size: 13px; font-weight: 500; color: #6b7280; padding: 7px 12px; border-radius: 8px; }
    .nav-link:hover { background: #f3f4f6; }
    .nav-cta { background: #f97316; color: #fff; font-size: 13px; font-weight: 700; padding: 8px 18px; border-radius: 10px; }

    .cat-hero { background: ${cat.color}; padding: clamp(40px,6vw,72px) clamp(20px,5vw,40px); color: #fff; }
    .cat-hero-inner { max-width: 760px; margin: 0 auto; }
    .cat-breadcrumb { font-size: 12px; color: rgba(255,255,255,0.7); margin-bottom: 16px; }
    .cat-breadcrumb a { color: rgba(255,255,255,0.85); }
    .cat-breadcrumb span { margin: 0 6px; }
    .cat-emoji { font-size: 48px; margin-bottom: 16px; display: block; }
    .cat-hero h1 { font-size: clamp(1.6rem,4vw,2.6rem); font-weight: 900; letter-spacing: -0.02em; margin-bottom: 14px; line-height: 1.15; }
    .cat-hero p { font-size: 15px; color: rgba(255,255,255,0.85); line-height: 1.75; max-width: 580px; }

    .wrap { max-width: 760px; margin: 0 auto; padding: clamp(32px,5vw,56px) clamp(20px,4vw,40px); }

    .section-label { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #f97316; margin-bottom: 20px; }

    .items-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }

    .item-card {
      background: #fff; border: 1.5px solid #e5e7eb; border-radius: 16px;
      padding: 18px 20px; display: flex; gap: 16px; align-items: flex-start;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .item-card:hover { border-color: #f97316; box-shadow: 0 4px 16px rgba(249,115,22,0.1); }
    .item-emoji { font-size: 28px; flex-shrink: 0; margin-top: 2px; }
    .item-body { flex: 1; }
    .item-name { font-size: 16px; font-weight: 800; color: #111827; margin-bottom: 5px; }
    .item-desc { font-size: 13px; color: #6b7280; line-height: 1.6; margin-bottom: 10px; }
    .item-price { font-size: 12px; font-weight: 700; color: #059669; margin-bottom: 10px; }
    .item-links { display: flex; gap: 8px; flex-wrap: wrap; }
    .item-link { font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 8px; display: inline-flex; align-items: center; gap: 5px; transition: opacity 0.15s; }
    .item-link:hover { opacity: 0.8; }
    .lk-amz { background: #fff3e0; color: #c2410c; }
    .lk-ebay { background: #ecfdf5; color: #065f46; }

    .analyzer-cta {
      background: linear-gradient(135deg, #111827, #1f2937);
      border-radius: 20px; padding: clamp(28px,4vw,44px); text-align: center; margin: 48px 0;
    }
    .analyzer-cta h2 { font-size: clamp(1.2rem,3vw,1.7rem); font-weight: 900; color: #fff; margin-bottom: 10px; letter-spacing: -0.01em; line-height: 1.3; }
    .analyzer-cta h2 span { color: #f97316; }
    .analyzer-cta p { font-size: 14px; color: #9ca3af; margin-bottom: 24px; line-height: 1.6; }
    .btn-analyze { background: #f97316; color: #fff; font-size: 15px; font-weight: 700; padding: 13px 28px; border-radius: 12px; display: inline-block; }

    .blog-link { margin: 32px 0; }
    .blog-link-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; margin-bottom: 10px; }
    .blog-link-card {
      background: #fff; border: 1.5px solid #e5e7eb; border-radius: 14px;
      padding: 18px 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
      transition: border-color 0.15s;
    }
    .blog-link-card:hover { border-color: #f97316; }
    .blog-link-title { font-size: 15px; font-weight: 700; color: #111827; margin-bottom: 4px; }
    .blog-link-sub { font-size: 12px; color: #f97316; font-weight: 600; }
    .blog-link-arrow { font-size: 20px; color: #9ca3af; flex-shrink: 0; }

    .related { border-top: 1px solid #e5e7eb; padding-top: 32px; margin-top: 32px; }
    .related-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; margin-top: 16px; }
    .related-card {
      background: #fff; border: 1.5px solid #e5e7eb; border-radius: 14px;
      padding: 16px 12px; text-align: center; transition: all 0.15s;
      display: flex; flex-direction: column; align-items: center; gap: 8px;
    }
    .related-card:hover { border-color: #f97316; transform: translateY(-2px); }
    .related-emoji { font-size: 28px; }
    .related-name { font-size: 12px; font-weight: 700; color: #111827; }

    footer { background: #111827; padding: 32px clamp(16px,4vw,40px); margin-top: 64px; }
    .footer-inner { max-width: 760px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
    .footer-logo { font-size: 16px; font-weight: 800; color: #fff; }
    .footer-logo span { color: #f97316; }
    .footer-copy { font-size: 12px; color: #4b5563; }
    @media (max-width: 640px) { .nav-links { display: none; } .item-card { flex-direction: column; } }
  </style>
</head>
<body>
<nav>
  <a href="/" class="logo">Obje<span>Match</span></a>
  <div class="nav-links">
    <a href="/blog/" class="nav-link">Blog</a>
    <a href="/room-analyzer.html" class="nav-link">Analyzer</a>
  </div>
  <a href="/room-analyzer.html" class="nav-cta">Try Free</a>
</nav>

<div class="cat-hero">
  <div class="cat-hero-inner">
    <div class="cat-breadcrumb"><a href="/">Home</a><span>›</span>${cat.name}</div>
    <span class="cat-emoji">${cat.emoji}</span>
    <h1>${cat.h1}</h1>
    <p>${cat.desc}</p>
  </div>
</div>

<div class="wrap">

  <div class="section-label">Most Searched — ${cat.name}</div>

  <div class="items-grid">
    ${itemCards}
  </div>

  <div class="analyzer-cta">
    <h2>Have a photo of your ${cat.name.toLowerCase()}?<br><span>Upload it — AI finds everything.</span></h2>
    <p>Instead of guessing, let AI identify every object and upgrade opportunity in your actual space.</p>
    <a href="/room-analyzer.html" class="btn-analyze">Analyze My ${cat.name} — Free</a>
  </div>

  ${blogSection}

  <div class="related">
    <div class="section-label">Other Categories</div>
    <div class="related-grid">
      ${relatedCards}
    </div>
  </div>

</div>

<footer>
  <div class="footer-inner">
    <div class="footer-logo">Obje<span>Match</span></div>
    <div class="footer-copy">© 2025 ObjeMatch · Amazon Associates participant</div>
  </div>
</footer>
</body>
</html>`;
}

// Generate all pages
categories.forEach(cat => {
  const html = buildPage(cat);
  const outPath = path.join(__dirname, 'category', `${cat.slug}.html`);
  fs.writeFileSync(outPath, html);
  console.log(`✓ ${cat.slug}.html`);
});

console.log(`\nGenerated ${categories.length} category pages.`);
