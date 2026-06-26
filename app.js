const layers = document.getElementById("layers");
const button = document.getElementById("collapseBtn");

button.onclick = () => {

    layers.classList.toggle("collapsed");

    if(layers.classList.contains("collapsed")){

        button.textContent = "❮";

    }else{

        button.textContent = "❯";

    }

}
