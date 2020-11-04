import { CanvasRenderer } from './CanvasRenderer';
import { Contract } from './Contract';
import { LocalStorageManager, toExploredChunk } from './LocalStorageManager';
import {
  PlanetHelper,
  VoyageContractData,
  PlanetVoyageIdMap,
} from './PlanetHelper';
import { Viewport } from './Viewport';
import multileveldown from '/vendor/multileveldown-browser.js';
import LevelRangeEmitter from '/vendor/level-range-emitter-browser.js';
import WebSocket from 'simple-websocket/simplewebsocket.min';

async function start() {
  const canvas = document.querySelector('canvas');

  if (!canvas) {
    console.error('Need a canvas');
    return;
  }

  const ctx = canvas.getContext('2d');

  if (ctx) {
    canvas.height = window.innerHeight;
    canvas.width = window.innerWidth;

    ctx.font = `18px sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'black';
    ctx.fillText('Loading the contract & map data. This will take awhile.', canvas.width / 2, canvas.height / 2);
  }

  const homeCoords = { x: 0, y: 0 };
  const widthInWorldUnits = 250;
  const endTimeSeconds = 1609372800;

  const db = multileveldown.client({ valueEncoding: 'json', retry: true });
  const websocketStream = new WebSocket(import.meta.env.VITE_DB_CONNECTION_URL);
  const lre = LevelRangeEmitter.client(db);
  lre.session(db.connect(), websocketStream);

  const chunkStore = new LocalStorageManager(db);

  lre.emitter.subscribe((key, type) => {
    if (type === 'put') {
      db.get(key, (err, value) => {
        if (err) {
          console.error(err);
          return;
        }

        chunkStore.updateChunk(toExploredChunk(value), true);
      });
    }
  });

  const contractsAPI = await Contract.create();

  const [
    _mapLoaded,
    contractConstants,
    worldRadius,
    allArrivals,
    planets,
  ] = await Promise.all([
    chunkStore.loadIntoMemory(),
    contractsAPI.getConstants(),
    contractsAPI.getWorldRadius(),
    contractsAPI.getAllArrivals(),
    contractsAPI.getPlanets(),
  ]);

  const perlinThresholds = [
    contractConstants.PERLIN_THRESHOLD_1,
    contractConstants.PERLIN_THRESHOLD_2,
  ];

  const arrivals: VoyageContractData = {};
  const planetVoyageIdMap: PlanetVoyageIdMap = {};

  planets.forEach((planet, locId) => {
    if (planets.has(locId)) {
      planetVoyageIdMap[locId] = [];
    }
  });

  for (const arrival of allArrivals) {
    planetVoyageIdMap[arrival.toPlanet].push(arrival.eventId);
    arrivals[arrival.eventId] = arrival;
  }

  canvas.height = window.innerHeight;
  canvas.width = window.innerWidth;

  const planetHelper = new PlanetHelper(
    planets,
    chunkStore,
    arrivals,
    planetVoyageIdMap,
    contractConstants,
    endTimeSeconds,
  );

  const viewport = new Viewport(
    planetHelper,
    homeCoords,
    widthInWorldUnits,
    canvas.width,
    canvas.height,
    canvas
  );

  const renderer = new CanvasRenderer(
    canvas,
    worldRadius,
    perlinThresholds,
    planetHelper,
    viewport
  );
}

start().then(console.log).catch(console.log);
