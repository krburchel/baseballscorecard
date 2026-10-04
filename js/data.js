// Reference data: positions, MLB teams and ids, logos, ballparks and stadium photos, postseason rounds.
// Loaded as a plain script; files share one global scope (see index.html for the order).

var POSITIONS = ['—','P','C','1B','2B','3B','SS','LF','CF','RF','DH','PH','PR','IF','OF'];

// Map team name → MLB Stats API team ID
var TEAM_IDS = {
  'Arizona Diamondbacks':109,'Atlanta Braves':144,'Baltimore Orioles':110,
  'Boston Red Sox':111,'Chicago Cubs':112,'Chicago White Sox':145,
  'Cincinnati Reds':113,'Cleveland Guardians':114,'Colorado Rockies':115,
  'Detroit Tigers':116,'Houston Astros':117,'Kansas City Royals':118,
  'Los Angeles Angels':108,'Los Angeles Dodgers':119,'Miami Marlins':146,
  'Milwaukee Brewers':158,'Minnesota Twins':142,'New York Mets':121,
  'New York Yankees':147,'Oakland Athletics':133,'Philadelphia Phillies':143,
  'Pittsburgh Pirates':134,'San Diego Padres':135,'San Francisco Giants':137,
  'Seattle Mariners':136,'St. Louis Cardinals':138,'Tampa Bay Rays':139,
  'Texas Rangers':140,'Toronto Blue Jays':141,'Washington Nationals':120
};

// Reverse map: team ID → team name
var TEAM_NAMES = {};

Object.keys(TEAM_IDS).forEach(function(name){ TEAM_NAMES[TEAM_IDS[name]] = name; });

var MLB_TEAMS = [
  '— Select Team —',
  // AL East
  'Baltimore Orioles','Boston Red Sox','New York Yankees','Tampa Bay Rays','Toronto Blue Jays',
  // AL Central
  'Chicago White Sox','Cleveland Guardians','Detroit Tigers','Kansas City Royals','Minnesota Twins',
  // AL West
  'Houston Astros','Los Angeles Angels','Oakland Athletics','Seattle Mariners','Texas Rangers',
  // NL East
  'Atlanta Braves','Miami Marlins','New York Mets','Philadelphia Phillies','Washington Nationals',
  // NL Central
  'Chicago Cubs','Cincinnati Reds','Milwaukee Brewers','Pittsburgh Pirates','St. Louis Cardinals',
  // NL West
  'Arizona Diamondbacks','Colorado Rockies','Los Angeles Dodgers','San Diego Padres','San Francisco Giants'
];

// Postseason badge per game type. MLB doesn't publish the round-specific event
// logos on its CDN, so pair the league logo with the round name.
var MLB_LEAGUE_LOGO = 'https://www.mlbstatic.com/team-logos/league-on-light/';

// maxGames: series length, for the "Game #" picker
var POSTSEASON = {
  wild: { label:'Wild Card',    logo: MLB_LEAGUE_LOGO + '1.svg',   maxGames: 3 },
  alds: { label:'ALDS',         logo: MLB_LEAGUE_LOGO + '103.svg', maxGames: 5 },
  alcs: { label:'ALCS',         logo: MLB_LEAGUE_LOGO + '103.svg', maxGames: 7 },
  nlds: { label:'NLDS',         logo: MLB_LEAGUE_LOGO + '104.svg', maxGames: 5 },
  nlcs: { label:'NLCS',         logo: MLB_LEAGUE_LOGO + '104.svg', maxGames: 7 },
  ws:   { label:'World Series', logo: MLB_LEAGUE_LOGO + '1.svg',   maxGames: 7 }
};

var TEAM_LOGOS = {
  'Arizona Diamondbacks':   'https://www.mlbstatic.com/team-logos/109.svg',
  'Atlanta Braves':         'https://www.mlbstatic.com/team-logos/144.svg',
  'Baltimore Orioles':      'https://www.mlbstatic.com/team-logos/110.svg',
  'Boston Red Sox':         'https://www.mlbstatic.com/team-logos/111.svg',
  'Chicago Cubs':           'https://www.mlbstatic.com/team-logos/112.svg',
  'Chicago White Sox':      'https://www.mlbstatic.com/team-logos/145.svg',
  'Cincinnati Reds':        'https://www.mlbstatic.com/team-logos/113.svg',
  'Cleveland Guardians':    'https://www.mlbstatic.com/team-logos/114.svg',
  'Colorado Rockies':       'https://www.mlbstatic.com/team-logos/115.svg',
  'Detroit Tigers':         'https://www.mlbstatic.com/team-logos/116.svg',
  'Houston Astros':         'https://www.mlbstatic.com/team-logos/117.svg',
  'Kansas City Royals':     'https://www.mlbstatic.com/team-logos/118.svg',
  'Los Angeles Angels':     'https://www.mlbstatic.com/team-logos/108.svg',
  'Los Angeles Dodgers':    'https://www.mlbstatic.com/team-logos/119.svg',
  'Miami Marlins':          'https://www.mlbstatic.com/team-logos/146.svg',
  'Milwaukee Brewers':      'https://www.mlbstatic.com/team-logos/158.svg',
  'Minnesota Twins':        'https://www.mlbstatic.com/team-logos/142.svg',
  'New York Mets':          'https://www.mlbstatic.com/team-logos/121.svg',
  'New York Yankees':       'https://www.mlbstatic.com/team-logos/147.svg',
  'Oakland Athletics':      'https://www.mlbstatic.com/team-logos/133.svg',
  'Philadelphia Phillies':  'https://www.mlbstatic.com/team-logos/143.svg',
  'Pittsburgh Pirates':     'https://www.mlbstatic.com/team-logos/134.svg',
  'San Diego Padres':       'https://www.mlbstatic.com/team-logos/135.svg',
  'San Francisco Giants':   'https://www.mlbstatic.com/team-logos/137.svg',
  'Seattle Mariners':       'https://www.mlbstatic.com/team-logos/136.svg',
  'St. Louis Cardinals':    'https://www.mlbstatic.com/team-logos/138.svg',
  'Tampa Bay Rays':         'https://www.mlbstatic.com/team-logos/139.svg',
  'Texas Rangers':          'https://www.mlbstatic.com/team-logos/140.svg',
  'Toronto Blue Jays':      'https://www.mlbstatic.com/team-logos/141.svg',
  'Washington Nationals':   'https://www.mlbstatic.com/team-logos/120.svg'
};

// ── Ballparks (venue names and locations, used for venue auto-fill) ──
var STADIUMS = {
  'Arizona Diamondbacks': { name:'Chase Field',             lat:33.44528, lng:-112.06694 },
  'Atlanta Braves':        { name:'Truist Park',             lat:33.89089, lng:-84.46778  },
  'Baltimore Orioles':     { name:'Oriole Park',             lat:39.28389, lng:-76.62167  },
  'Boston Red Sox':        { name:'Fenway Park',             lat:42.34667, lng:-71.09722  },
  'Chicago Cubs':          { name:'Wrigley Field',           lat:41.94833, lng:-87.65528  },
  'Chicago White Sox':     { name:'Guaranteed Rate Field',   lat:41.83000, lng:-87.63389  },
  'Cincinnati Reds':       { name:'Great American Ball Park',lat:39.09750, lng:-84.50833  },
  'Cleveland Guardians':   { name:'Progressive Field',       lat:41.49583, lng:-81.68528  },
  'Colorado Rockies':      { name:'Coors Field',             lat:39.75583, lng:-104.99417 },
  'Detroit Tigers':        { name:'Comerica Park',           lat:42.33917, lng:-83.04861  },
  'Houston Astros':        { name:'Minute Maid Park',        lat:29.75722, lng:-95.35556  },
  'Kansas City Royals':    { name:'Kauffman Stadium',        lat:39.05139, lng:-94.48028  },
  'Los Angeles Angels':    { name:'Angel Stadium',           lat:33.80028, lng:-117.88278 },
  'Los Angeles Dodgers':   { name:'Dodger Stadium',          lat:34.07361, lng:-118.24000 },
  'Miami Marlins':         { name:'LoanDepot Park',          lat:25.77806, lng:-80.21972  },
  'Milwaukee Brewers':     { name:'American Family Field',   lat:43.02806, lng:-87.97111  },
  'Minnesota Twins':       { name:'Target Field',            lat:44.98167, lng:-93.27806  },
  'New York Mets':         { name:'Citi Field',              lat:40.75694, lng:-73.84583  },
  'New York Yankees':      { name:'Yankee Stadium',          lat:40.82944, lng:-73.92611  },
  'Oakland Athletics':     { name:'Sutter Health Park',      lat:38.58000, lng:-121.50056 },
  'Philadelphia Phillies': { name:'Citizens Bank Park',      lat:39.90583, lng:-75.16639  },
  'Pittsburgh Pirates':    { name:'PNC Park',                lat:40.44694, lng:-80.00583  },
  'San Diego Padres':      { name:'Petco Park',              lat:32.70722, lng:-117.15722 },
  'San Francisco Giants':  { name:'Oracle Park',             lat:37.77861, lng:-122.38917 },
  'Seattle Mariners':      { name:'T-Mobile Park',           lat:47.59139, lng:-122.33250 },
  'St. Louis Cardinals':   { name:'Busch Stadium',           lat:38.62250, lng:-90.19278  },
  'Tampa Bay Rays':        { name:'Tropicana Field',         lat:27.76833, lng:-82.65333  },
  'Texas Rangers':         { name:'Globe Life Field',        lat:32.74722, lng:-97.08222  },
  'Toronto Blue Jays':     { name:'Rogers Centre',           lat:43.64139, lng:-79.38944  },
  'Washington Nationals':  { name:'Nationals Park',          lat:38.87306, lng:-77.00750  }
};

// Stadium photos: each ballpark's lead photo from Wikipedia / Wikimedia Commons
// (freely licensed — credited under the photo, linking to the file page).
var STADIUM_PHOTOS = {
  "Arizona Diamondbacks": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a2/Reserve_A-10_Warthogs_Flyover_2023_World_Series_%288099146%29.jpg/500px-Reserve_A-10_Warthogs_Flyover_2023_World_Series_%288099146%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Reserve_A-10_Warthogs_Flyover_2023_World_Series_(8099146).jpg", by:"U.S. Air Force photo by Staff Sgt. Tyler J. Bolken", lic:"Public domain" },
  "Athletics": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e6/Sutter_Health_Park_aerial_view_2023_%28Quintin_Soloviev%29.jpg/500px-Sutter_Health_Park_aerial_view_2023_%28Quintin_Soloviev%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Sutter_Health_Park_aerial_view_2023_(Quintin_Soloviev).jpg", by:"Quintin Soloviev", lic:"CC BY 4.0" },
  "Atlanta Braves": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/0/04/Truist_Park_2025.jpg/500px-Truist_Park_2025.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Truist_Park_2025.jpg", by:"TarheelBornBred", lic:"CC0" },
  "Baltimore Orioles": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/5/51/OrioleParkatCamdenYardsSummer2025.jpg/500px-OrioleParkatCamdenYardsSummer2025.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:OrioleParkatCamdenYardsSummer2025.jpg", by:"Aspifi", lic:"CC BY-SA 4.0" },
  "Boston Red Sox": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4f/131023-F-PR861-033_Hanscom_participates_in_World_Series_pregame_events.jpg/500px-131023-F-PR861-033_Hanscom_participates_in_World_Series_pregame_events.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:131023-F-PR861-033_Hanscom_participates_in_World_Series_pregame_events.jpg", by:"Rick Berry", lic:"Public domain" },
  "Chicago Cubs": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c9/Wrigley_Field_in_line_with_sign.jpg/500px-Wrigley_Field_in_line_with_sign.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Wrigley_Field_in_line_with_sign.jpg", by:"Sea Cow", lic:"CC BY-SA 4.0" },
  "Chicago White Sox": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/5/57/Chicago%2C_Illinois%2C_U.S._%282023%29_-_062.jpg/500px-Chicago%2C_Illinois%2C_U.S._%282023%29_-_062.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Chicago,_Illinois,_U.S._(2023)_-_062.jpg", by:"Another Believer", lic:"CC BY-SA 4.0" },
  "Cincinnati Reds": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4a/10Cincinnati_2015_%282%29.jpg/500px-10Cincinnati_2015_%282%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:10Cincinnati_2015_(2).jpg", by:"Laslovarga", lic:"CC BY-SA 4.0" },
  "Cleveland Guardians": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f1/Cleveland_Guardians_vs._New_York_Yankees_on_Oct_17_2024_%2854102149292%29.jpg/500px-Cleveland_Guardians_vs._New_York_Yankees_on_Oct_17_2024_%2854102149292%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Cleveland_Guardians_vs._New_York_Yankees_on_Oct_17_2024_(54102149292).jpg", by:"Erik Drost", lic:"CC BY 2.0" },
  "Colorado Rockies": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e2/Coors_Field_July_2015.jpg/500px-Coors_Field_July_2015.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Coors_Field_July_2015.jpg", by:"Thelastcanadian", lic:"CC BY-SA 4.0" },
  "Detroit Tigers": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/0/06/Detroit_Tigers_opening_game_at_Comerica_Park%2C_2007.jpg/500px-Detroit_Tigers_opening_game_at_Comerica_Park%2C_2007.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Detroit_Tigers_opening_game_at_Comerica_Park,_2007.jpg", by:"User MJCdetroit on en.wikipedia", lic:"CC BY-SA 3.0" },
  "Houston Astros": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/1/10/Houston%2C_Texas_%282024%29_-_09.jpg/500px-Houston%2C_Texas_%282024%29_-_09.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Houston,_Texas_(2024)_-_09.jpg", by:"Another Believer", lic:"CC BY-SA 4.0" },
  "Kansas City Royals": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/3/35/Kauffman2017.jpg/500px-Kauffman2017.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Kauffman2017.jpg", by:"Chibears85", lic:"CC BY-SA 4.0" },
  "Los Angeles Angels": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4a/Angelstadiummarch2019.jpg/500px-Angelstadiummarch2019.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Angelstadiummarch2019.jpg", by:"CrispyCream27", lic:"CC BY-SA 4.0" },
  "Los Angeles Dodgers": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/5/50/Dodger_Stadium_and_Chavez_Ravine_far_view%2C_Chicago_Cubs_at_Los_Angeles_Dodgers%2C_%28April_12%2C_2025%29.jpg/500px-Dodger_Stadium_and_Chavez_Ravine_far_view%2C_Chicago_Cubs_at_Los_Angeles_Dodgers%2C_%28April_12%2C_2025%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Dodger_Stadium_and_Chavez_Ravine_far_view,_Chicago_Cubs_at_Los_Angeles_Dodgers,_(April_12,_2025).jpg", by:"Spatms", lic:"CC BY-SA 4.0" },
  "Miami Marlins": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/5/53/LOAN_DEPOT_PARK.jpg/500px-LOAN_DEPOT_PARK.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:LOAN_DEPOT_PARK.jpg", by:"Ven-Lib", lic:"CC BY-SA 4.0" },
  "Milwaukee Brewers": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cc/Miller_Park_in_Milwaukee%2C_Wisconsin.jpg/500px-Miller_Park_in_Milwaukee%2C_Wisconsin.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Miller_Park_in_Milwaukee,_Wisconsin.jpg", by:"Carol H. Highsmith", lic:"Public domain" },
  "Minnesota Twins": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/1/17/Target_Field%2C_Minneapolis%2C_Minnesota_%2843167053335%29.jpg/500px-Target_Field%2C_Minneapolis%2C_Minnesota_%2843167053335%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Target_Field,_Minneapolis,_Minnesota_(43167053335).jpg", by:"Ken Lund from Reno, Nevada, USA", lic:"CC BY-SA 2.0" },
  "New York Mets": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e6/Citi_Field_%2848613685207%29.jpg/500px-Citi_Field_%2848613685207%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Citi_Field_(48613685207).jpg", by:"Ajay Suresh from New York, NY, USA", lic:"CC BY 2.0" },
  "New York Yankees": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/a/af/Yankee_Stadium_overhead_2010.jpg/500px-Yankee_Stadium_overhead_2010.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Yankee_Stadium_overhead_2010.jpg", by:"vtravelled.com", lic:"CC BY 2.0" },
  "Philadelphia Phillies": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f6/Citizens_Bank_Park_2021.jpg/500px-Citizens_Bank_Park_2021.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Citizens_Bank_Park_2021.jpg", by:"Chris6d", lic:"CC BY-SA 4.0" },
  "Pittsburgh Pirates": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0e/Pittsburgh_Pirates_park_%28Unsplash%29.jpg/500px-Pittsburgh_Pirates_park_%28Unsplash%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Pittsburgh_Pirates_park_(Unsplash).jpg", by:"Joshua Peacock jcpeacock", lic:"CC0" },
  "San Diego Padres": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/5/55/Petco_Park_Padres_Game.jpg/500px-Petco_Park_Padres_Game.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Petco_Park_Padres_Game.jpg", by:"Mds08011", lic:"CC BY 4.0" },
  "San Francisco Giants": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8e/Oracle_Park_2021.jpg/500px-Oracle_Park_2021.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Oracle_Park_2021.jpg", by:"Chris6d", lic:"CC BY-SA 4.0" },
  "Seattle Mariners": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/1/10/SafecoFieldTop.jpg/500px-SafecoFieldTop.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:SafecoFieldTop.jpg", by:"MyName (Cacophony)", lic:"CC BY-SA 3.0" },
  "St. Louis Cardinals": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fb/Busch_Stadium_2022.jpg/500px-Busch_Stadium_2022.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Busch_Stadium_2022.jpg", by:"Lightmetro", lic:"CC BY-SA 4.0" },
  "Tampa Bay Rays": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5e/PXL_20220528_205520913.jpg/500px-PXL_20220528_205520913.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:PXL_20220528_205520913.jpg", by:"Vmartin12", lic:"CC BY-SA 4.0" },
  "Texas Rangers": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a0/GlobeLifeField2021.jpg/500px-GlobeLifeField2021.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:GlobeLifeField2021.jpg", by:"slgckgc", lic:"CC BY 2.0" },
  "Toronto Blue Jays": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6e/Rogers_Centre_%28500_Level%29_-_Toronto%2C_ON.jpg/500px-Rogers_Centre_%28500_Level%29_-_Toronto%2C_ON.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Rogers_Centre_(500_Level)_-_Toronto,_ON.jpg", by:"JFVoll", lic:"CC BY-SA 4.0" },
  "Washington Nationals": { img:"https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f9/Nationals_Park_8.16.19_-_7.jpg/500px-Nationals_Park_8.16.19_-_7.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page:"https://commons.wikimedia.org/wiki/File:Nationals_Park_8.16.19_-_7.jpg", by:"APK", lic:"CC BY-SA 4.0" }
};
