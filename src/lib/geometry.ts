/**
 * Calculates the intersection point between a line segment and a circle.
 * This is used to make SVG arrows point exactly at the edge of the node,
 * rather than its center.
 * 
 * @param sourceX Center X of the source node
 * @param sourceY Center Y of the source node
 * @param targetX Center X of the target node
 * @param targetY Center Y of the target node
 * @param radius Radius of the target node
 * @returns {x, y} coordinate of the intersection on the circle's edge
 */
export function getCircleIntersection(
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number,
    radius: number
) {
    // Calculate the distance between the two centers
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // If perfectly overlapping or distance is less than radius, just return center
    if (distance <= radius) {
        return { x: targetX, y: targetY };
    }

    // Normalized direction vector of the line
    const dirX = dx / distance;
    const dirY = dy / distance;

    // The intersection point on the edge of the target circle
    const intersectionX = targetX - dirX * radius;
    const intersectionY = targetY - dirY * radius;

    return { x: intersectionX, y: intersectionY };
}
