# Aotearoa Election Simulator

Open `index.html` in a browser to use the simulator. Official electorate boundaries and a New Zealand coastline outline are bundled locally, and the map does not request third-party basemap tiles. Leaflet and display fonts load from online CDNs.

The general and Māori electorate boundaries are the Representation Commission's 2025 boundaries for the 2026 General Election. The coastline outline is from Natural Earth. The simulator keeps your electorate assignments and party vote inputs in browser storage on this device.

The starter party-vote split is illustrative. The simulator apportions 120 seats among parties with at least 5% of the party vote or one electorate seat, using Sainte-Laguë. Electorate seats are counted within a party's entitlement; any electorate wins above that entitlement count as overhang seats and are added to the House total.
