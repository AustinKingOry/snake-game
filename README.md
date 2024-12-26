# Snake Game

A modern implementation of the classic Snake game using JavaScript, HTML, and CSS Grid. This game features both keyboard and click/touch controls, making it playable across different devices.

## 🎮 Demo Features

- Responsive grid-based gameplay
- Dual control systems (keyboard & click/touch)
- Score tracking
- Mobile-friendly controls
- Game reset functionality
- Clean, modern UI with Tailwind CSS

## 🚀 Getting Started

### Prerequisites
- A modern web browser
- Internet connection (for CDN resources)

### Installation
1. Clone the repository:
```bash
git clone https://github.com/AustinKingOry/snake-game.git
```
2. Open `index.html` in your web browser

## 🎯 How to Play

### Keyboard Controls
- Use arrow keys (↑, ↓, ←, →) to change the snake's direction
- Snake will continue moving in the current direction until a new direction is chosen

### Mouse/Touch Controls
- Click or tap anywhere on the grid to direct the snake
- The snake will move towards the clicked location while following game rules
- Use the on-screen control pad (toggle with keyboard icon) for touch devices

### Game Rules
- Guide the snake to eat the blue food squares
- Each food square eaten increases your score by 10 points
- Game ends if the snake:
  - Hits the wall
  - Collides with itself

### Additional Controls
- Click the reset button (↺) to start a new game
- Toggle the on-screen controls with the keyboard icon button

## 🛠️ Technical Details

### Built With
- HTML5
- CSS3 (Grid & Flexbox)
- JavaScript (jQuery)
- Tailwind CSS
- Bootstrap 5 (for components)
- Bootstrap Icons

### Game Features
- Responsive grid system
- Collision detection
- Score tracking
- Toast notifications
- Mobile-responsive design

## 🎨 Customization

The game can be customized by modifying:
- Grid size in `App.js` (tileWidth and tileHeight)
- Snake speed (setInterval value)
- Colors (via Tailwind classes)
- Grid appearance (App.css)

## 📱 Browser Compatibility

Tested and working on:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers

## 🤝 Contributing

Contributions are welcome! Feel free to:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

This project is open source and available under the MIT License.