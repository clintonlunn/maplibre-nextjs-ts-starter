import { useCallback, useEffect, useMemo } from 'react'
import { GeoJSONSource, Layer, Source } from 'react-map-gl'

import useCategories from '@/hooks/useCategories'
import usePlaces from '@/hooks/usePlaces'
import { CATEGORY_ID } from '@/lib/constants'
import {
  clusterBelowLayer,
  clusterCountBadgeLayer,
  clusterCountLayer,
  clusterLayer,
  iconLayer,
  markerLayer,
} from '@/map/Layers/layers'
import useMapActions from '@/map/useMapActions'
import useMapContext from '@/map/useMapContext'
import useMapStore from '@/zustand/useMapStore'
import useSettingsStore from '@/zustand/useSettingsStore'

const Layers = () => {
  const { placesGroupedByCategory, markerCategoryIDs, getPlaceById } = usePlaces()
  const { getCategoryById } = useCategories()
  const markerSize = useSettingsStore(state => state.markerSize)
  const { clusterRadius, setMarkerPopup } = useMapStore()
  const { map } = useMapContext()
  const { handleMapMove } = useMapActions()

  const categoryCluster = useMemo(
    () =>
      Object.entries(placesGroupedByCategory).map(catGroup => {
        const [category, places] = catGroup

        const features: GeoJSON.Feature<GeoJSON.Point>[] = places.map(place => ({
          type: 'Feature',
          properties: {
            id: place.id,
            category,
          },
          geometry: {
            type: 'Point',
            coordinates: [place.longitude, place.latitude],
          },
        }))

        const collection: GeoJSON.FeatureCollection<GeoJSON.Point> = {
          type: 'FeatureCollection',
          features,
        }

        const catColor = getCategoryById(parseFloat(category))?.color || 'red'

        return (
          // <Source
          //   key={`${category}${clusterRadius}`}
          //   id={`source-${category}`}
          //   type="geojson"
          //   data={collection}
          //   clusterMaxZoom={17}
          //   clusterRadius={clusterRadius}
          //   cluster
          // >
          //   <Layer {...markerLayer(category, markerSize, catColor)} />
          //   <Layer {...clusterBelowLayer(category, markerSize, catColor)} />
          //   <Layer {...clusterLayer(category, markerSize, catColor)} />
          //   <Layer {...iconLayer(category, markerSize)} />
          //   <Layer {...clusterCountBadgeLayer(category, markerSize)} />
          //   <Layer {...clusterCountLayer(category)} />
          // </Source>
          <Source
            id="my-polygon-source"
            type="geojson"
            data="https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/Utah_Geologic_Hazards/FeatureServer/4/query?where=1%3D1&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&returnCentroid=false&returnEnvelope=false&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token="
          >
            <Layer
              id="my-polygon-layer"
              type="fill"
              paint={{
                'fill-color': [
                  'match',
                  ['get', 'LSCHazardUnit'],
                  'Ulsc',
                  'rgba(255,167,127,1)', // color for 'Ulsc'
                  // add more mappings as needed
                  'rgba(0,0,0,1)', // default color
                ],
                'fill-opacity': 0.5,
              }}
            />
            <Layer
              id="my-polygon-outline-layer"
              type="line"
              paint={{
                'line-color': 'rgba(0,0,0,1)', // outline color
                'line-width': 0.4, // outline width
              }}
            />
          </Source>
        )
      }),
    [getCategoryById, placesGroupedByCategory],
  )

  const onClick = useCallback(
    (event: mapboxgl.MapMouseEvent & mapboxgl.EventData, category: CATEGORY_ID) => {
      if (!map || !placesGroupedByCategory) return
      event.preventDefault()

      const clusters = map.queryRenderedFeatures(event.point, {
        layers: [`cluster-${category}`],
      })
      const markers = map.queryRenderedFeatures(event.point, {
        layers: [`marker-${category}`],
      })

      const mapboxSource = map.getSource(`source-${category}`) as GeoJSONSource

      if (clusters.length) {
        const clusterId = clusters[0]?.properties?.cluster_id
        mapboxSource.getClusterExpansionZoom(clusterId, (_err, zoom) => {
          // be save & return if zoom is undefined
          if (!zoom) return

          handleMapMove({
            latitude: event.lngLat.lat,
            longitude: event.lngLat.lng,
            zoom: zoom + 0.5,
          })
        })
        return
      }

      const markerId = markers[0]?.properties?.id
      const place = getPlaceById(markerId)
      if (!place) return

      setMarkerPopup(place.id)

      handleMapMove({
        latitude: place.latitude,
        longitude: place.longitude,
        fly: false,
        zoom: map.getZoom(),
        offset: [0, -30],
        mouseUpOnceCallback: () => {
          setMarkerPopup(undefined)
        },
      })
    },
    [getPlaceById, handleMapMove, map, setMarkerPopup, placesGroupedByCategory],
  )

  useEffect(() => {
    map &&
      markerCategoryIDs?.forEach(category => {
        map.on('click', `cluster-${category}`, e => onClick(e, category))
        map.on('click', `marker-${category}`, e => onClick(e, category))

        const catImage = getCategoryById(category)?.iconMedium || ''

        map?.loadImage(`${catImage}`, (error, image) => {
          if (!map.hasImage(`category-thumb-${category}`)) {
            if (!image || error) return
            map.addImage(`category-thumb-${category}`, image)
          }
        })
      })

    return () => {
      map &&
        markerCategoryIDs?.forEach(category => {
          map.off('click', `cluster-${category}`, e => onClick(e, category))
          map.off('click', `marker-${category}`, e => onClick(e, category))
          if (map.hasImage(`category-thumb-${category}`)) {
            map.removeImage(`category-thumb-${category}`)
          }
        })
    }
  }, [getCategoryById, map, markerCategoryIDs, onClick])

  return categoryCluster
}

export default Layers
