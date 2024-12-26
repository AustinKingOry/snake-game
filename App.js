$(document).ready(function (){
    const gameFrame = $("#game-frame");
    let snakeGrid = $("#snake-grid");
    const tileWidth = 12;
    const tileHeight = 12;
    let columns = Math.floor(snakeGrid.width()/tileWidth);
    let rows = Math.floor(snakeGrid.height()/tileHeight);
    
    // Game state
    let score = 0;
    let gameOver = false;
    let snake = {
        body: [], // Array of positions
        direction: 'right'
    };
    let food = null;
    
    const createTile = index => {
        return `<div class="tile w-3 h-3 bg-gray-50 text-[6px]" data-index="${index}"></div>`;
    }

    const createFood = () => {
        let position;
        do {
            position = Math.floor(Math.random() * (columns * rows));
        } while (snake.body.includes(position));
        
        food = position;
        $(".tile").eq(position).addClass("bg-blue-600 flex-shrink-0 rounded food");
    }

    const initializeSnake = () => {
        const startPos = Math.floor((rows/2) * columns + columns/4);
        snake.body = [startPos, startPos-1, startPos-2];
        snake.direction = 'right';
        
        snake.body.forEach((pos, index) => {
            const tile = $(".tile").eq(pos);
            if(index === 0) {
                tile.addClass("bg-gray-600 rounded head");
            } else {
                tile.addClass("bg-gray-500 snake-piece rounded border border-gray-50");
            }
        });
    }

    const moveSnake = () => {
        if(gameOver) return;
        
        const head = snake.body[0];
        let newHead;
        
        // Calculate new head position
        switch(snake.direction) {
            case 'right':
                newHead = head + 1;
                if(head % columns === columns - 1) gameOver = true;
                break;
            case 'left':
                newHead = head - 1;
                if(head % columns === 0) gameOver = true;
                break;
            case 'up':
                newHead = head - columns;
                if(newHead < 0) gameOver = true;
                break;
            case 'down':
                newHead = head + columns;
                if(newHead >= columns * rows) gameOver = true;
                break;
        }
        
        if(gameOver) {
            endGame();
            return;
        }
        
        // Check collision with self
        if(snake.body.includes(newHead)) {
            endGame()
            return;
        }
        
        // Clear all tiles that aren't food
        $(".tile").not(".food").removeClass("bg-gray-600 bg-gray-500 rounded head snake-piece border border-gray-50");
        
        // Check if food is eaten
        if(newHead === food) {
            score += 10;
            $(".tile").eq(food).removeClass("bg-blue-600 food");
            createFood();
        } else {
            // Remove tail
            snake.body.pop();
        }
        
        // Add new head
        snake.body.unshift(newHead);
        
        // Redraw snake
        snake.body.forEach((pos, index) => {
            const tile = $(".tile").eq(pos);
            if(index === 0) {
                tile.addClass("bg-gray-600 rounded head");
            } else {
                tile.addClass("bg-gray-500 snake-piece rounded border border-gray-50");
            }
        });
    }

    const handleKeyPress = (e) => {
        if(gameOver) return;
        
        switch(e.key) {
            case 'ArrowRight':
                if(snake.direction !== 'left') snake.direction = 'right';
                break;
            case 'ArrowLeft':
                if(snake.direction !== 'right') snake.direction = 'left';
                break;
            case 'ArrowUp':
                if(snake.direction !== 'down') snake.direction = 'up';
                break;
            case 'ArrowDown':
                if(snake.direction !== 'up') snake.direction = 'down';
                break;
        }
    }

    const getCoordinates = (currentTile, columns) => {
        let col = currentTile % columns;
        let row = Math.floor(currentTile / columns);
        return { row, col };
    }

    const handleClick = function(e) {
        if(gameOver) return;
        
        const clickedTile = parseInt($(this).data("index"));
        const clickedCoords = getCoordinates(clickedTile, columns);
        const headCoords = getCoordinates(snake.body[0], columns);
        
        // Determine direction based on click position relative to snake head
        if(Math.abs(clickedCoords.col - headCoords.col) > Math.abs(clickedCoords.row - headCoords.row)) {
            // Horizontal movement takes priority
            if(clickedCoords.col > headCoords.col) {
                if(snake.direction !== 'left') snake.direction = 'right';
            } else {
                if(snake.direction !== 'right') snake.direction = 'left';
            }
        } else {
            // Vertical movement
            if(clickedCoords.row > headCoords.row) {
                if(snake.direction !== 'up') snake.direction = 'down';
            } else {
                if(snake.direction !== 'down') snake.direction = 'up';
            }
        }
    }

    const createGrid = () => {
        snakeGrid.html("");
        columns = Math.floor(snakeGrid.width()/tileWidth);
        rows = Math.floor(snakeGrid.height()/tileHeight);
        
        snakeGrid.css("--columns", columns);
        snakeGrid.css("--rows", rows);
        
        for(let i = 0; i < columns * rows; i++) {
            snakeGrid.append(createTile(i));
        }
        
        initializeSnake();
        createFood();
    }

    const resetGame = () => {
        // Reset game state
        score = 0;
        gameOver = false;
        snake = {
            body: [],
            direction: 'right'
        };
        food = null;
        
        // Clear grid
        $(".tile").removeClass("bg-gray-600 bg-gray-500 bg-blue-600 rounded head snake-piece border border-gray-50 food");
        
        // Reinitialize game
        initializeSnake();
        createFood();
    }

    // end game 
    const endGame = () => {
        gameOver = true;
        alert(`Game Over! Score: ${score}`);
    }

    // handle custom navigation button
    $("#move-up").on('click', () => {
        if(gameOver) return;
        snake.direction = 'up';
    });
    $("#move-down").on('click', () => {
        if(gameOver) return;
        snake.direction = 'down';
    });
    $("#move-left").on('click', () => {
        if(gameOver) return;
        snake.direction = 'left';
    });
    $("#move-right").on('click', () => {
        if(gameOver) return;
        snake.direction = 'right';
    });

    // Initialize game
    createGrid();
    $(document).on('keydown', handleKeyPress);
    // Add click handler
    $(document).on('click', '.tile', handleClick);
    
    // Game loop
    setInterval(moveSnake, 150);

    $("#reset-game").on('click', resetGame);
});