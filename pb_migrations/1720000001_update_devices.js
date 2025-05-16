/// <reference path="../pb_data/types.d.ts" />

migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("devices");

  // Add take_screenshot field
  collection.schema.push({
    "id": "take_screenshot",
    "name": "take_screenshot",
    "type": "bool",
    "system": false,
    "required": false,
    "options": {}
  });

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("devices");

  // Remove take_screenshot field
  collection.schema = collection.schema.filter(field => field.name !== "take_screenshot");

  return dao.saveCollection(collection);
});
