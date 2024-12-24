$(document).ready(function (){
    const gameFrame = $("#game-frame");
    let snakeGrid = $("#snake-grid");
    const tileWidth = 12;
    const tileHeight = 12;
    let columns = Math.floor(gameFrame.width()/tileWidth),
    rows = Math.floor(gameFrame.height()/tileHeight);

    const createTile = index =>{
        const tile = `<div class="tile w-3 h-3 rounded bg-gray-500 border flex-shrink-0"></div>`;
        return tile;
    }
    const createTiles = quantity => {
        Array.from(Array(quantity)).map((tile,index)=>{
            snakeGrid.append(createTile(index));
        })
    }

    const createGrid = () => {
        snakeGrid.html = "";
        columns = Math.floor(gameFrame.width()/tileWidth);
        rows = Math.floor(gameFrame.height()/tileHeight);

        snakeGrid.css("--columns",columns);
        snakeGrid.css("--rows",rows);
        createTiles(columns*rows)
    }

    window.onresize = () => createGrid();
    gameFrame.on("click", function(){
        console.log('clicked')
    })
})